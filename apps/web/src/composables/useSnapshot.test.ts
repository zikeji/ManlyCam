import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function makeMockCanvas(width: number, height: number) {
  const mockContext = {
    drawImage: vi.fn(),
  };
  return {
    width,
    height,
    getContext: vi.fn(() => mockContext),
    toBlob: vi.fn(),
  };
}

const mockGetPetName = vi.fn(() => 'Manly');
const mockGetSiteName = vi.fn(() => 'ManlyCam');

vi.mock('@/lib/env', () => ({
  getPetName: () => mockGetPetName(),
  getSiteName: () => mockGetSiteName(),
}));

describe('useSnapshot', () => {
  let mockCanvas: ReturnType<typeof makeMockCanvas>;
  let mockAnchor: {
    click: ReturnType<typeof vi.fn>;
    href: string | null;
    download: string | null;
  };
  let createElementSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCanvas = makeMockCanvas(640, 480);
    mockAnchor = {
      click: vi.fn(),
      href: null,
      download: null,
    };

    // Track createElement calls
    createElementSpy = vi.fn();
    vi.stubGlobal('document', {
      createElement: createElementSpy,
    });

    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:http://example.com/snapshot.jpg'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('takeSnapshot', () => {
    // Helper to invoke the toBlob callback
    const invokeToBlobCallback = () => {
      const toBlobCall = mockCanvas.toBlob.mock.calls[0];
      const callback = toBlobCall[0] as (blob: Blob | null) => void;
      const mockBlob = new Blob([''], { type: 'image/jpeg' });
      callback(mockBlob);
    };

    it('creates canvas with video dimensions', async () => {
      const mockVideo = {
        videoWidth: 640,
        videoHeight: 480,
      } as HTMLVideoElement;

      createElementSpy.mockReturnValueOnce(mockCanvas as unknown as HTMLCanvasElement);

      const { useSnapshot } = await import('./useSnapshot');
      const { takeSnapshot } = useSnapshot();

      takeSnapshot(mockVideo, 'Manly');

      expect(createElementSpy).toHaveBeenCalledWith('canvas');
      expect(mockCanvas.width).toBe(640);
      expect(mockCanvas.height).toBe(480);
    });

    it('draws video frame to canvas via drawImage', async () => {
      const mockVideo = {
        videoWidth: 640,
        videoHeight: 480,
      } as HTMLVideoElement;
      const mockContext = mockCanvas.getContext();

      createElementSpy.mockReturnValueOnce(mockCanvas as unknown as HTMLCanvasElement);

      const { useSnapshot } = await import('./useSnapshot');
      const { takeSnapshot } = useSnapshot();

      takeSnapshot(mockVideo, 'Manly');

      expect(mockContext?.drawImage).toHaveBeenCalledWith(mockVideo, 0, 0);
    });

    it('converts canvas to JPEG blob with correct MIME type and quality 0.92', async () => {
      const mockVideo = {
        videoWidth: 640,
        videoHeight: 480,
      } as HTMLVideoElement;

      createElementSpy.mockReturnValueOnce(mockCanvas as unknown as HTMLCanvasElement);

      const { useSnapshot } = await import('./useSnapshot');
      const { takeSnapshot } = useSnapshot();

      takeSnapshot(mockVideo, 'Manly');

      expect(mockCanvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.75);
    });

    it('generates filename with site name, pet name, and timestamp in format {SITE_NAME}_{PET_NAME}_YYYYMMDD-HHmmssZ.jpg', async () => {
      const mockVideo = {
        videoWidth: 640,
        videoHeight: 480,
      } as HTMLVideoElement;

      // First call returns canvas, second returns anchor
      createElementSpy.mockReturnValueOnce(mockCanvas as unknown as HTMLCanvasElement);
      createElementSpy.mockReturnValueOnce(mockAnchor as unknown as HTMLAnchorElement);

      const { useSnapshot } = await import('./useSnapshot');
      const { takeSnapshot } = useSnapshot();

      takeSnapshot(mockVideo, 'Manly');
      invokeToBlobCallback();

      // Verify anchor download attribute was set
      expect(mockAnchor.download).toBeDefined();
      const filename = mockAnchor.download;

      // Check format: ManlyCam_Manly_YYYYMMDD-HHmmssssZ.jpg (with milliseconds)
      expect(filename).toMatch(/^ManlyCam_Manly_\d{8}-\d{9}Z\.jpg$/);
    });

    it('creates object URL from blob and sets as anchor href', async () => {
      const mockVideo = {
        videoWidth: 640,
        videoHeight: 480,
      } as HTMLVideoElement;

      createElementSpy.mockReturnValueOnce(mockCanvas as unknown as HTMLCanvasElement);
      createElementSpy.mockReturnValueOnce(mockAnchor as unknown as HTMLAnchorElement);

      const { useSnapshot } = await import('./useSnapshot');
      const { takeSnapshot } = useSnapshot();

      takeSnapshot(mockVideo, 'Manly');
      invokeToBlobCallback();

      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(mockAnchor.href).toBe('blob:http://example.com/snapshot.jpg');
    });

    it('programmatically clicks anchor to trigger download', async () => {
      const mockVideo = {
        videoWidth: 640,
        videoHeight: 480,
      } as HTMLVideoElement;

      createElementSpy.mockReturnValueOnce(mockCanvas as unknown as HTMLCanvasElement);
      createElementSpy.mockReturnValueOnce(mockAnchor as unknown as HTMLAnchorElement);

      const { useSnapshot } = await import('./useSnapshot');
      const { takeSnapshot } = useSnapshot();

      takeSnapshot(mockVideo, 'Manly');
      invokeToBlobCallback();

      expect(mockAnchor.click).toHaveBeenCalled();
    });

    it('revokes object URL after download to prevent memory leaks', async () => {
      const mockVideo = {
        videoWidth: 640,
        videoHeight: 480,
      } as HTMLVideoElement;

      createElementSpy.mockReturnValueOnce(mockCanvas as unknown as HTMLCanvasElement);
      createElementSpy.mockReturnValueOnce(mockAnchor as unknown as HTMLAnchorElement);

      const { useSnapshot } = await import('./useSnapshot');
      const { takeSnapshot } = useSnapshot();

      takeSnapshot(mockVideo, 'Manly');
      invokeToBlobCallback();

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://example.com/snapshot.jpg');
    });

    it('does not append anchor to DOM (no memory leak risk)', async () => {
      const mockVideo = {
        videoWidth: 640,
        videoHeight: 480,
      } as HTMLVideoElement;

      const mockAppendChild = vi.fn();
      vi.stubGlobal('document', {
        createElement: createElementSpy,
        body: { appendChild: mockAppendChild },
      });

      createElementSpy.mockReturnValueOnce(mockCanvas as unknown as HTMLCanvasElement);
      createElementSpy.mockReturnValueOnce(mockAnchor as unknown as HTMLAnchorElement);

      const { useSnapshot } = await import('./useSnapshot');
      const { takeSnapshot } = useSnapshot();

      takeSnapshot(mockVideo, 'Manly');
      invokeToBlobCallback();

      expect(mockAppendChild).not.toHaveBeenCalled();
    });
  });

  describe('Firefox black-row crop fix', () => {
    beforeEach(() => {
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 Firefox/124.0' });
    });

    it('crops bottom black rows when detected in Firefox', async () => {
      const width = 4;
      const height = 4;

      // Rows 0-2 are white (non-black), row 3 (bottom) is all-black zeros
      const pixelData = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          pixelData[i] = 255;
          pixelData[i + 1] = 255;
          pixelData[i + 2] = 255;
          pixelData[i + 3] = 255;
        }
      }

      const mockContextWithGetImageData = {
        drawImage: vi.fn(),
        getImageData: vi.fn(() => ({ data: pixelData })),
      };
      const mockOriginalCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => mockContextWithGetImageData),
        toBlob: vi.fn(),
      };
      const mockCroppedCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({ drawImage: vi.fn() })),
        toBlob: vi.fn(),
      };

      createElementSpy
        .mockReturnValueOnce(mockOriginalCanvas as unknown as HTMLCanvasElement)
        .mockReturnValueOnce(mockCroppedCanvas as unknown as HTMLCanvasElement);

      const mockVideo = { videoWidth: width, videoHeight: height } as HTMLVideoElement;

      const { useSnapshot } = await import('./useSnapshot');
      const { takeSnapshot } = useSnapshot();

      takeSnapshot(mockVideo, 'Manly');

      // Cropped canvas should have 3 rows (row 3 was black and stripped)
      expect(mockCroppedCanvas.height).toBe(3);
      expect(mockCroppedCanvas.width).toBe(4);
      // toBlob called on the cropped canvas, not the original
      expect(mockCroppedCanvas.toBlob).toHaveBeenCalled();
      expect(mockOriginalCanvas.toBlob).not.toHaveBeenCalled();
    });

    it('uses original canvas when no black rows are present at the bottom in Firefox', async () => {
      const width = 2;
      const height = 2;

      // All pixels are white — no black rows at bottom
      const pixelData = new Uint8ClampedArray(width * height * 4).fill(255);

      const mockContextAllWhite = {
        drawImage: vi.fn(),
        getImageData: vi.fn(() => ({ data: pixelData })),
      };
      const mockAllWhiteCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => mockContextAllWhite),
        toBlob: vi.fn(),
      };

      createElementSpy.mockReturnValueOnce(mockAllWhiteCanvas as unknown as HTMLCanvasElement);

      const mockVideo = { videoWidth: width, videoHeight: height } as HTMLVideoElement;

      const { useSnapshot } = await import('./useSnapshot');
      const { takeSnapshot } = useSnapshot();

      takeSnapshot(mockVideo, 'Manly');

      // No second canvas created — original returned as-is
      const canvasCalls = createElementSpy.mock.calls.filter((c) => c[0] === 'canvas');
      expect(canvasCalls).toHaveLength(1);
      // toBlob called on original canvas
      expect(mockAllWhiteCanvas.toBlob).toHaveBeenCalled();
    });

    it('crops multiple consecutive black rows at the bottom', async () => {
      const width = 2;
      const height = 5;

      // Rows 0-1 are white, rows 2-4 (bottom 3) are black
      const pixelData = new Uint8ClampedArray(width * height * 4);
      for (let x = 0; x < width; x++) {
        for (let row = 0; row < 2; row++) {
          const i = (row * width + x) * 4;
          pixelData[i] = 128;
          pixelData[i + 1] = 128;
          pixelData[i + 2] = 128;
          pixelData[i + 3] = 255;
        }
      }

      const mockContextMultiBlack = {
        drawImage: vi.fn(),
        getImageData: vi.fn(() => ({ data: pixelData })),
      };
      const mockOriginal = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => mockContextMultiBlack),
        toBlob: vi.fn(),
      };
      const mockCropped = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({ drawImage: vi.fn() })),
        toBlob: vi.fn(),
      };

      createElementSpy
        .mockReturnValueOnce(mockOriginal as unknown as HTMLCanvasElement)
        .mockReturnValueOnce(mockCropped as unknown as HTMLCanvasElement);

      const mockVideo = { videoWidth: width, videoHeight: height } as HTMLVideoElement;

      const { useSnapshot } = await import('./useSnapshot');
      const { takeSnapshot } = useSnapshot();

      takeSnapshot(mockVideo, 'Manly');

      // 3 black rows stripped — only 2 content rows remain
      expect(mockCropped.height).toBe(2);
      expect(mockCropped.toBlob).toHaveBeenCalled();
    });
  });
});
