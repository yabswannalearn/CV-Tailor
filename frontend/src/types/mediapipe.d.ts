declare module "@mediapipe/tasks-vision" {
  export type NormalizedLandmark = { x: number; y: number; z?: number };
  export type Category = { categoryName: string; score: number };
  export type FaceLandmarkerResult = {
    faceLandmarks: NormalizedLandmark[][];
    faceBlendshapes?: { categories: Category[] }[];
  };
  export type VisionFileset = unknown;
  export type LandmarkerOptions = Record<string, unknown>;

  export class FaceLandmarker {
    static createFromOptions(vision: VisionFileset, options: LandmarkerOptions): Promise<FaceLandmarker>;
    detectForVideo(video: HTMLVideoElement, timestamp: number): FaceLandmarkerResult;
    close(): void;
  }

  export class FilesetResolver {
    static forVisionTasks(wasmFileset: string): Promise<VisionFileset>;
  }

  export class PoseLandmarker {
    static createFromOptions(vision: VisionFileset, options: LandmarkerOptions): Promise<PoseLandmarker>;
    detectForVideo(video: HTMLVideoElement, timestamp: number): unknown;
    close(): void;
  }
}
