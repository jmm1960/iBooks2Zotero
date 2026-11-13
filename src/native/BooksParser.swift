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
    func invalid()->NSError {NSError(domain:"BooksParser",code:2)}
    guard let plist=try PropertyListSerialization.propertyList(from:data,format:nil) as? [String:Any],let objects=plist["$objects"] as? [Any],let top=plist["$top"] as? [String:Any] else {throw invalid()}
    // Read keyed-archive references without instantiating arbitrary archived classes.
    func object(_ reference:Any?) throws -> Any {
        guard let reference=reference else {throw invalid()}
        let text=String(describing:reference)
        guard let range=text.range(of:"value = "),let index=Int(text[range.upperBound...].prefix(while:{$0.isNumber})),objects.indices.contains(index) else {throw invalid()}
        return objects[index]
    }
    guard let root=try object(top["root"]) as? [String:Any],let raw=try object(root["drawing"]) as? Data,
          let size=try object(root["drawingSize"]) as? [String:Any],let keys=size["NS.keys"] as? [Any],let values=size["NS.objects"] as? [Any],keys.count==values.count else {throw invalid()}
    var dims:[String:Double]=[:]
    for (key,value) in zip(keys,values) {guard let name=try object(key) as? String,let number=try object(value) as? NSNumber else {throw invalid()};dims[name]=number.doubleValue}
    guard let w=dims["Width"],let h=dims["Height"],w.isFinite,h.isFinite,w>0,h>0 else {throw NSError(domain:"BooksParser",code:3)}
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
func drawingPreview(_ drawing:PKDrawing)->Data? {
    let box=drawing.bounds
    guard !box.isEmpty,!box.isNull,box.width.isFinite,box.height.isFinite else {return nil}
    let scale=min(1,2000/max(box.width,box.height)),w=max(1,Int(ceil(box.width*scale))),h=max(1,Int(ceil(box.height*scale)))
    guard let ctx=CGContext(data:nil,width:w,height:h,bitsPerComponent:8,bytesPerRow:w*4,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue) else {return nil}
    ctx.setLineCap(.round);ctx.setLineJoin(.round)
    for stroke in drawing.strokes {
        let points=Array(stroke.path.interpolatedPoints(by:.distance(0.7)))
        guard let first=points.first else {continue}
        let color=stroke.ink.color.usingColorSpace(.deviceRGB) ?? .blue
        ctx.setStrokeColor(color.cgColor);ctx.setFillColor(color.cgColor);ctx.setLineWidth(max(0.2,first.size.width*0.6*scale))
        func position(_ point:PKStrokePoint)->CGPoint {let q=point.location.applying(stroke.transform);return CGPoint(x:(q.x-box.minX)*scale,y:(box.maxY-q.y)*scale)}
        if points.count==1 {let q=position(first);ctx.fillEllipse(in:CGRect(x:q.x-1,y:q.y-1,width:2,height:2));continue}
        ctx.beginPath();ctx.move(to:position(first));for point in points.dropFirst(){ctx.addLine(to:position(point))};ctx.strokePath()
    }
    guard let image=ctx.makeImage() else {return nil}
    return NSBitmapImageRep(cgImage:image).representation(using:.png,properties:[:])
}
func main()throws {
    let args=CommandLine.arguments
    guard args.count>=4 else {throw NSError(domain:"BooksParser",code:1)}
    if args[1]=="bundle-assets" {
        let directory=URL(fileURLWithPath:args[2],isDirectory:true)
        let urls=try FileManager.default.contentsOfDirectory(at:directory,includingPropertiesForKeys:nil)
        let maximum=256*1024*1024
        var bytes=try urls.reduce(0){sum,url in sum+((try FileManager.default.attributesOfItem(atPath:url.path)[.size] as? NSNumber)?.intValue ?? 0)}
        if bytes>maximum {throw NSError(domain:"BooksParser",code:6)}
        for url in urls where url.lastPathComponent.hasSuffix(".apple.plist") {
            let (drawing,size)=try decode(Data(contentsOf:url))
            let stem=String(url.lastPathComponent.dropLast(".apple.plist".count))
            let raw=drawing.dataRepresentation();bytes+=raw.count
            if bytes>maximum {throw NSError(domain:"BooksParser",code:6)}
            try raw.write(to:directory.appendingPathComponent(stem+".drawing"))
            let box=drawing.bounds
            if let png=drawingPreview(drawing) {
                bytes+=png.count
                if bytes>maximum {throw NSError(domain:"BooksParser",code:6)}
                try png.write(to:directory.appendingPathComponent(stem+".png"))
                try write(["coordinateSpace":"drawing-top-left","rendering":"approximate-stroke-preview","bounds":[box.minX,box.minY,box.width,box.height],"drawingSize":[size.width,size.height]],directory.appendingPathComponent(stem+".preview.json").path)
            }
        }
        try write(["ok":true],args[3]);return
    }
    let legacy=args[1]=="legacy"
    let documentPath=legacy && args.count>4 ? args[4] : args[2]
    guard let document=PDFDocument(url:URL(fileURLWithPath:documentPath)) else {throw NSError(domain:"BooksParser",code:1,userInfo:[NSLocalizedDescriptionKey:"Cannot open the PDF file."])}
    if document.isLocked {throw NSError(domain:"BooksParser",code:4,userInfo:[NSLocalizedDescriptionKey:"The PDF is encrypted. Unlock it first."])}
    if args[1]=="inspect" || args[1]=="inspect-preview" {
        let indices=args.count>4 ? args[4].split(separator:",").compactMap{Int($0)} : []
        var pages:[[String:Any]]=[]
        for i in indices {
            guard let page=document.page(at:i) else{continue}
            var entry:[String:Any]=["pageIndex":i,"fingerprint":signature(page),"bounds":[page.bounds(for:.mediaBox).width,page.bounds(for:.mediaBox).height],"rotation":page.rotation]
            if args[1]=="inspect-preview"{entry["background"]=preview(page)}
            pages.append(entry)
        }
        try write(["pageCount":document.pageCount,"pages":pages],args[3]);return
    }
    if legacy {
        let descriptor=try JSONSerialization.jsonObject(with:Data(contentsOf:URL(fileURLWithPath:args[2]))) as! [[String:Any]]
        for i in 0..<document.pageCount {if let page=document.page(at:i){for annotation in page.annotations{page.removeAnnotation(annotation)}}}
        for entry in descriptor {
            guard let number=entry["pdf_page"] as? Int,let page=document.page(at:number-1),
                  let rect=entry["rectangle"] as? [Double],rect.count==4 else {throw NSError(domain:"BooksParser",code:5)}
            let type=entry["type"] as? String ?? ""
            let bounds=CGRect(x:rect[0],y:rect[1],width:rect[2]-rect[0],height:rect[3]-rect[1])
            let annotation=PDFAnnotation(bounds:bounds,forType:type=="/Square" ? .square : type=="/Highlight" ? .highlight : .text,withProperties:nil)
            annotation.color = .yellow;annotation.contents=entry["text"] as? String ?? ""
            if type=="/Square" {
                guard let encoded=entry["archive"] as? String,let data=Data(base64Encoded:encoded) else {throw NSError(domain:"BooksParser",code:5)}
                let (_,size)=try decode(data),box=page.bounds(for:.mediaBox)
                guard abs((size.width/size.height)/(box.width/box.height)-1)<0.01 else {throw NSError(domain:"BooksParser",code:5)}
                annotation.setValue(["AKAnnotationV2":encoded],forAnnotationKey:PDFAnnotationKey(rawValue:"AAPL:" + "AK" + "Extras"))
            }
            page.addAnnotation(annotation)
        }
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
            pages.append(["pageIndex":i,"pageLabel":page.label ?? String(i+1),"bounds":[Double(bounds.width),Double(bounds.height)],"rotation":page.rotation,"fingerprint":legacy ? "" : signature(page),"background":preview(page),"strokes":strokes,"notes":notes,"appleArchives":native])
        }
    }
    if legacy {warnings.append(["code":"warning.legacy"])}
    var seenWarnings=Set<String>()
    let uniqueWarnings=warnings.filter { warning in
        let key=["code","page","type","detail"].map{String(describing:warning[$0] ?? "")}.joined(separator:"|")
        return seenWarnings.insert(key).inserted
    }
    try write(["format":"apple-books-notes","version":1,"pageCount":document.pageCount,"legacy":legacy,"pages":pages,"warnings":uniqueWarnings],args[3])
}
do {try main()} catch {let output=CommandLine.arguments.count>3 ? CommandLine.arguments[3] : "/dev/null";let native=error as NSError;var result:[String:Any]=["error":error.localizedDescription];if native.domain=="BooksParser"{result["errorCode"]=native.code};try? write(result,output);fputs("\(error)\n",stderr);exit(1)}
