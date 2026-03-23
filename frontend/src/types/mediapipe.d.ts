declare module "@mediapipe/tasks-vision" {
  export class FaceLandmarker {
    static createFromOptions(vision: any, options: any): Promise<FaceLandmarker>;
    detectForVideo(video: HTMLVideoElement, timestamp: number): any;
    close(): void;
  }

  export class FilesetResolver {
    static forVisionTasks(wasmFileset: string): Promise<any>;
  }

  export class PoseLandmarker {
    static createFromOptions(vision: any, options: any): Promise<PoseLandmarker>;
    detectForVideo(video: HTMLVideoElement, timestamp: number): any;
    close(): void;
  }
}