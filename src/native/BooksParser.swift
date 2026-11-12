import Foundation
import PDFKit
import PencilKit
import AppKit
import CryptoKit

func dictionary(_ x: Any?) -> [String:Any]? { x as? [String:Any] }
func archive(_ annotation: PDFAnnotation) -> Data? {
    func search(_ d: [AnyHashable:Any], depth: Int) -> Data? {
        guard depth < 5 else { return nil }
        for (key,value) in d {
            if String(describing:key).contains("AKAnnotationV2"), let s=value as? String, let data=Data(base64Encoded:s) { return data }
        }
        for (_,value) in d { if let nested=dictionary(value), let data=search(nested,depth:depth+1) { return data } }
        return nil
    }
    if let extras=annotation.value(forAnnotationKey:PDFAnnotationKey(rawValue:"AAPL:" + "AK" + "Extras")) as? [AnyHashable:Any], let data=search(extras,depth:0) { return data }
    return search(annotation.annotationKeyValues,depth:0)
}
func decode(_ data:Data) throws -> (PKDrawing,CGSize) {
    let plist=try PropertyListSerialization.propertyList(from:data,format:nil) as! [String:Any]
    let objects=plist["$objects"] as! [Any]
    // NSKeyedArchiver UIDs are decoded using CoreFoundation's UID wrapper.
    func index(_ value:Any) throws -> Int {
        let text=String(describing:value)
        if let range=text.range(of:"value = "), let n=Int(text[range.upperBound...].prefix(while:{$0.isNumber})) { return n }
        throw NSError(domain:"BooksParser",code:2,userInfo:[NSLocalizedDescriptionKey:"Cannot read Apple drawing archive reference: \(text)"])
    }
    let rootIndex=try index((plist["$top"] as! [String:Any])["root"]!)
    let root=objects[rootIndex] as! [String:Any]
    let raw=objects[try index(root["drawing"]!)] as! Data
    let sizeObject=objects[try index(root["drawingSize"]!)] as! [String:Any]
    let keys=sizeObject["NS.keys"] as! [Any], values=sizeObject["NS.objects"] as! [Any]
    var dims:[String:Double]=[:]
    for (key,value) in zip(keys,values) { dims[objects[try index(key)] as! String]=(objects[try index(value)] as! NSNumber).doubleValue }
    guard let w=dims["Width"],let h=dims["Height"],w>0,h>0 else { throw NSError(domain:"BooksParser",code:3) }
    return (try PKDrawing(data:raw),CGSize(width:w,height:h))
}
func renderPage(_ page:PDFPage, width:Int)->CGImage? {
    let box=page.bounds(for:.mediaBox)
    let w=(box.width*1000).rounded()/1000,h=(box.height*1000).rounded()/1000
    let height=Int((Double(width)*h/w).rounded())
    guard let ctx=CGContext(data:nil,width:width,height:height,bitsPerComponent:8,bytesPerRow:width,space:CGColorSpaceCreateDeviceGray(),bitmapInfo:0), let ref=page.pageRef else{return nil}
    ctx.setFillColor(gray:1,alpha:1);ctx.fill(CGRect(x:0,y:0,width:width,height:height))
    ctx.scaleBy(x:Double(width)/w,y:Double(height)/h)
    ctx.translateBy(x:-box.minX,y:-box.minY)
    ctx.drawPDFPage(ref)
    return ctx.makeImage()
}
func signature(_ page:PDFPage)->String {
    guard let image=renderPage(page,width:128),let data=image.dataProvider?.data else{return ""}
    return SHA256.hash(data:data as Data).map{String(format:"%02x",$0)}.joined()
}
func preview(_ page:PDFPage)->String {
    guard let image=renderPage(page,width:700),let data=NSBitmapImageRep(cgImage:image).representation(using:.png,properties:[:]) else{return ""}
    return "data:image/png;base64,"+data.base64EncodedString()
}
func write(_ value:Any,_ path:String)throws {
    let data=try JSONSerialization.data(withJSONObject:value,options:[.sortedKeys])
    try data.write(to:URL(fileURLWithPath:path),options:.atomic)
}
func main()throws {
    let args=CommandLine.arguments
    guard args.count>=4,let document=PDFDocument(url:URL(fileURLWithPath:args[2])) else {throw NSError(domain:"BooksParser",code:1,userInfo:[NSLocalizedDescriptionKey:"Cannot open the PDF file."])}
    if document.isLocked {throw NSError(domain:"BooksParser",code:4,userInfo:[NSLocalizedDescriptionKey:"The PDF is encrypted. Unlock it first."])}
    if args[1]=="inspect" {
        let indices=args.count>4 ? args[4].split(separator:",").compactMap{Int($0)} : []
        var pages:[[String:Any]]=[]
        for i in indices {guard let page=document.page(at:i) else{continue};pages.append(["pageIndex":i,"fingerprint":signature(page),"bounds":[page.bounds(for:.mediaBox).width,page.bounds(for:.mediaBox).height],"rotation":page.rotation])}
        try write(["pageCount":document.pageCount,"pages":pages],args[3]);return
    }
    var pages:[[String:Any]]=[],warnings:[[String:Any]]=[]
    for i in 0..<document.pageCount {
        guard let page=document.page(at:i) else {continue}
        var strokes:[[String:Any]]=[];var native:[String]=[];var notes:[[String:Any]]=[]
        let bounds=page.bounds(for:.mediaBox)
        for annotation in page.annotations {
            if let data=archive(annotation) {
                do {
                    let (drawing,size)=try decode(data)
                    let sx=bounds.width/size.width,sy=bounds.height/size.height
                    native.append(data.base64EncodedString())
                    for s in drawing.strokes {
                        if s.renderBounds.isNull || s.ink.color.alphaComponent < 0.01 { continue }
                        if s.mask != nil {warnings.append(["code":"warning.mask","page":i+1])}
                        let c=s.ink.color.usingColorSpace(.deviceRGB) ?? NSColor.blue
                        let color=String(format:"#%02x%02x%02x",Int((c.redComponent*255).rounded()),Int((c.greenComponent*255).rounded()),Int((c.blueComponent*255).rounded()))
                        let points=s.path.interpolatedPoints(by:.distance(0.7)).map{p->[Double] in
                            let q=p.location.applying(s.transform)
                            return [Double(bounds.minX+q.x*sx),Double(bounds.maxY-q.y*sy),Double(p.size.width*sx*0.6)]
                        }
                        if !points.isEmpty {strokes.append(["color":color,"points":points])}
                    }
                } catch {warnings.append(["code":"warning.drawing","page":i+1,"detail":error.localizedDescription])}
            } else if annotation.type == "Highlight" {
                let b=annotation.bounds
                var rects:[[Double]]=[]
                if let q=annotation.quadrilateralPoints, q.count>=4 {
                    for start in stride(from:0,to:q.count-3,by:4) {
                        let ps=q[start..<start+4].map{$0.pointValue}
                        rects.append([Double(b.minX+ps.map{$0.x}.min()!),Double(b.minY+ps.map{$0.y}.min()!),Double(b.minX+ps.map{$0.x}.max()!),Double(b.minY+ps.map{$0.y}.max()!)])
                    }
                } else {rects=[[b.minX,b.minY,b.maxX,b.maxY].map{Double($0)}]}
                let c=annotation.color.usingColorSpace(.deviceRGB) ?? .yellow
                let color=String(format:"#%02x%02x%02x",Int((c.redComponent*255).rounded()),Int((c.greenComponent*255).rounded()),Int((c.blueComponent*255).rounded()))
                notes.append(["type":"highlight","rects":rects,"color":color,"comment":annotation.contents ?? "","text":page.selection(for:b)?.string ?? ""])
            } else if annotation.type == "Text",let text=annotation.contents,!text.isEmpty {
                let b=annotation.bounds
                notes.append(["type":"note","rects":[[Double(b.minX),Double(b.minY),Double(b.maxX),Double(b.maxY)]],"color":"#ffd400","comment":text])
            } else if annotation.type != "Link" {warnings.append(["code":"warning.type","page":i+1,"type":annotation.type ?? "Unknown"])}
        }
        if !strokes.isEmpty || !notes.isEmpty {
            pages.append(["pageIndex":i,"pageLabel":page.label ?? String(i+1),"bounds":[Double(bounds.width),Double(bounds.height)],"rotation":page.rotation,"fingerprint":signature(page),"background":preview(page),"strokes":strokes,"notes":notes,"appleArchives":native])
        }
    }
    var seenWarnings=Set<String>()
    let uniqueWarnings=warnings.filter { warning in
        let key=["code","page","type","detail"].map{String(describing:warning[$0] ?? "")}.joined(separator:"|")
        return seenWarnings.insert(key).inserted
    }
    try write(["format":"apple-books-notes","version":1,"pageCount":document.pageCount,"pages":pages,"warnings":uniqueWarnings],args[3])
}
do {try main()} catch {let output=CommandLine.arguments.count>3 ? CommandLine.arguments[3] : "/dev/null";let native=error as NSError;var result:[String:Any]=["error":error.localizedDescription];if native.domain=="BooksParser"{result["errorCode"]=native.code};try? write(result,output);fputs("\(error)\n",stderr);exit(1)}
