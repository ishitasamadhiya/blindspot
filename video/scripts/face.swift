// Face landmarks + person segmentation for the avatar scene, using the Vision framework
// that ships with macOS (no Python packages needed). Usage:
//   swiftc -O scripts/face.swift -o /tmp/face && /tmp/face <photo> <landmarks.json> <mask.pgm>
import Foundation
import Vision
import ImageIO

let args = CommandLine.arguments
guard args.count >= 4 else { fputs("usage: face <image> <out.json> <mask.pgm>\n", stderr); exit(2) }
let url = URL(fileURLWithPath: args[1])
guard let src = CGImageSourceCreateWithURL(url as CFURL, nil), let cg = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
  fputs("cannot read image\n", stderr); exit(1)
}
let W = cg.width, H = cg.height
let handler = VNImageRequestHandler(cgImage: cg, orientation: .up, options: [:])
let face = VNDetectFaceLandmarksRequest()
face.revision = VNDetectFaceLandmarksRequestRevision3
let seg = VNGeneratePersonSegmentationRequest()
seg.qualityLevel = .accurate
seg.outputPixelFormat = kCVPixelFormatType_OneComponent8
do { try handler.perform([face, seg]) } catch { fputs("vision failed: \(error)\n", stderr); exit(1) }

// image-normalised coordinates, origin top-left, y down
func pts(_ r: VNFaceLandmarkRegion2D?) -> [[Double]] {
  guard let r = r else { return [] }
  return r.pointsInImage(imageSize: CGSize(width: W, height: H)).map { [Double($0.x) / Double(W), 1.0 - Double($0.y) / Double(H)] }
}
var out: [String: Any] = ["width": W, "height": H]
guard let f = face.results?.first else { fputs("no face found\n", stderr); exit(1) }
let bb = f.boundingBox
out["bbox"] = ["x": bb.origin.x, "y": 1 - bb.origin.y - bb.height, "w": bb.width, "h": bb.height]
out["roll"] = f.roll?.doubleValue ?? 0
out["yaw"] = f.yaw?.doubleValue ?? 0
out["pitch"] = f.pitch?.doubleValue ?? 0
if let lm = f.landmarks {
  out["faceContour"] = pts(lm.faceContour)
  out["leftEye"] = pts(lm.leftEye)
  out["rightEye"] = pts(lm.rightEye)
  out["leftEyebrow"] = pts(lm.leftEyebrow)
  out["rightEyebrow"] = pts(lm.rightEyebrow)
  out["nose"] = pts(lm.nose)
  out["noseCrest"] = pts(lm.noseCrest)
  out["medianLine"] = pts(lm.medianLine)
  out["outerLips"] = pts(lm.outerLips)
  out["innerLips"] = pts(lm.innerLips)
  out["leftPupil"] = pts(lm.leftPupil)
  out["rightPupil"] = pts(lm.rightPupil)
}
let data = try! JSONSerialization.data(withJSONObject: out, options: [])
try! data.write(to: URL(fileURLWithPath: args[2]))
print("face bbox \(bb) roll \(out["roll"]!) yaw \(out["yaw"]!) pitch \(out["pitch"]!)")

if let m = seg.results?.first {
  let pb = m.pixelBuffer
  CVPixelBufferLockBaseAddress(pb, .readOnly)
  let w = CVPixelBufferGetWidth(pb), h = CVPixelBufferGetHeight(pb), bpr = CVPixelBufferGetBytesPerRow(pb)
  let base = CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self)
  var bytes = Data("P5\n\(w) \(h)\n255\n".utf8)
  for y in 0..<h { bytes.append(base + y * bpr, count: w) }
  CVPixelBufferUnlockBaseAddress(pb, .readOnly)
  try! bytes.write(to: URL(fileURLWithPath: args[3]))
  print("mask \(w)x\(h)")
} else {
  fputs("no segmentation result\n", stderr); exit(1)
}
