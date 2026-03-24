export const CAMERA_CONTROLS_ALLOWLIST = [
  'rpiCameraBrightness',
  'rpiCameraContrast',
  'rpiCameraSaturation',
  'rpiCameraSharpness',
  'rpiCameraExposure',
  'rpiCameraAWB',
  'rpiCameraAWBGains',
  'rpiCameraDenoise',
  'rpiCameraShutter',
  'rpiCameraMetering',
  'rpiCameraGain',
  'rpiCameraEV',
  'rpiCameraHDR',
  'rpiCameraAfMode',
  'rpiCameraAfRange',
  'rpiCameraAfSpeed',
  'rpiCameraLensPosition',
  'rpiCameraFlickerPeriod',
  'rpiCameraTextOverlayEnable',
  'rpiCameraTextOverlay',
  'rpiCameraFPS',
  'rpiCameraBitrate',
  'rpiCameraIDRPeriod',
  'rpiCameraWidth',
  'rpiCameraHeight',
  'rpiCameraHFlip',
  'rpiCameraVFlip',
] as const;

export type CameraControlKey = (typeof CAMERA_CONTROLS_ALLOWLIST)[number];
export type CameraSettingsMap = Partial<Record<CameraControlKey, unknown>>;

export type CameraControlType = 'switch' | 'slider' | 'select' | 'number' | 'text' | 'dual-number';
export type CameraControlSection =
  | 'Image'
  | 'Exposure'
  | 'White Balance'
  | 'Autofocus'
  | 'Overlay'
  | 'Encoding';

export interface CameraControlMeta {
  key: CameraControlKey;
  label: string;
  section: CameraControlSection;
  type: CameraControlType;
  min?: number;
  max?: number;
  step?: number;
  defaultValue: unknown;
  options?: Array<{ value: string; label: string }>;
  /** Key/value pair that must match for this control to be shown */
  showIf?: { key: CameraControlKey; value: unknown };
  description?: string;
  restartRequired?: boolean;
  /** Convert between display/input units and backend storage units (e.g. kbps ↔ bps) */
  transform?: {
    fromBackend: (v: number) => number;
    toBackend: (v: number) => number;
  };
}

export const CAMERA_CONTROL_META: CameraControlMeta[] = [
  // --- Image ---
  {
    key: 'rpiCameraBrightness',
    label: 'Brightness',
    section: 'Image',
    type: 'slider',
    min: -1.0,
    max: 1.0,
    step: 0.01,
    defaultValue: 0,
  },
  {
    key: 'rpiCameraContrast',
    label: 'Contrast',
    section: 'Image',
    type: 'slider',
    min: 0.0,
    max: 32.0,
    step: 0.1,
    defaultValue: 1,
  },
  {
    key: 'rpiCameraSaturation',
    label: 'Saturation',
    section: 'Image',
    type: 'slider',
    min: 0.0,
    max: 32.0,
    step: 0.1,
    defaultValue: 1,
  },
  {
    key: 'rpiCameraSharpness',
    label: 'Sharpness',
    section: 'Image',
    type: 'slider',
    min: 0.0,
    max: 16.0,
    step: 0.1,
    defaultValue: 1,
  },
  {
    key: 'rpiCameraHDR',
    label: 'HDR',
    section: 'Image',
    type: 'switch',
    defaultValue: false,
    restartRequired: true,
  },
  // --- Exposure ---
  {
    key: 'rpiCameraExposure',
    label: 'Exposure Mode',
    section: 'Exposure',
    type: 'select',
    defaultValue: 'normal',
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'short', label: 'Short' },
      { value: 'long', label: 'Long' },
      { value: 'custom', label: 'Custom' },
    ],
  },
  {
    key: 'rpiCameraShutter',
    label: 'Shutter Speed (µs)',
    section: 'Exposure',
    type: 'number',
    min: 0,
    max: 200000,
    step: 100,
    defaultValue: 0,
    description: '0 = auto. Value in microseconds.',
  },
  {
    key: 'rpiCameraGain',
    label: 'Analogue Gain',
    section: 'Exposure',
    type: 'slider',
    min: 0,
    max: 16.0,
    step: 0.1,
    defaultValue: 0,
    description: '0 = auto.',
  },
  {
    key: 'rpiCameraEV',
    label: 'Exposure Compensation (EV)',
    section: 'Exposure',
    type: 'slider',
    min: -8.0,
    max: 8.0,
    step: 0.1,
    defaultValue: 0,
  },
  {
    key: 'rpiCameraMetering',
    label: 'Metering Mode',
    section: 'Exposure',
    type: 'select',
    defaultValue: 'centre',
    options: [
      { value: 'centre', label: 'Centre' },
      { value: 'spot', label: 'Spot' },
      { value: 'matrix', label: 'Matrix' },
      { value: 'custom', label: 'Custom' },
    ],
  },
  {
    key: 'rpiCameraFlickerPeriod',
    label: 'Anti-Flicker Period (µs)',
    section: 'Exposure',
    type: 'number',
    min: 0,
    max: 20000,
    step: 1,
    defaultValue: 0,
    description: '0 = disabled. For 50Hz: 10000µs. For 60Hz: 8333µs.',
  },
  // --- White Balance ---
  {
    key: 'rpiCameraAWB',
    label: 'Auto White Balance',
    section: 'White Balance',
    type: 'select',
    defaultValue: 'auto',
    options: [
      { value: 'auto', label: 'Auto' },
      { value: 'incandescent', label: 'Incandescent' },
      { value: 'tungsten', label: 'Tungsten' },
      { value: 'fluorescent', label: 'Fluorescent' },
      { value: 'indoor', label: 'Indoor' },
      { value: 'daylight', label: 'Daylight' },
      { value: 'cloudy', label: 'Cloudy' },
      { value: 'custom', label: 'Custom (manual gains)' },
    ],
  },
  {
    key: 'rpiCameraAWBGains',
    label: 'AWB Gains [Red, Blue]',
    section: 'White Balance',
    type: 'dual-number',
    min: 0.0,
    max: 8.0,
    step: 0.01,
    defaultValue: [0, 0],
    showIf: { key: 'rpiCameraAWB', value: 'custom' },
    description: 'Manual red and blue channel gains. Only active when AWB Mode = Custom.',
  },
  // --- Autofocus ---
  {
    key: 'rpiCameraAfMode',
    label: 'Autofocus Mode',
    section: 'Autofocus',
    type: 'select',
    defaultValue: 'continuous',
    restartRequired: true,
    options: [
      { value: 'continuous', label: 'Continuous' },
      { value: 'auto', label: 'Auto (trigger)' },
      { value: 'manual', label: 'Manual' },
    ],
  },
  {
    key: 'rpiCameraAfRange',
    label: 'Autofocus Range',
    section: 'Autofocus',
    type: 'select',
    defaultValue: 'normal',
    restartRequired: true,
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'macro', label: 'Macro' },
      { value: 'full', label: 'Full' },
    ],
  },
  {
    key: 'rpiCameraAfSpeed',
    label: 'Autofocus Speed',
    section: 'Autofocus',
    type: 'select',
    defaultValue: 'normal',
    restartRequired: true,
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'fast', label: 'Fast' },
    ],
  },
  {
    key: 'rpiCameraLensPosition',
    label: 'Lens Position (diopters)',
    section: 'Autofocus',
    type: 'slider',
    min: 0.0,
    max: 32.0,
    step: 0.1,
    defaultValue: 0,
    showIf: { key: 'rpiCameraAfMode', value: 'manual' },
    description: 'Manual focus distance in diopters. Only active when AF Mode = Manual.',
  },
  // --- Overlay ---
  {
    key: 'rpiCameraTextOverlayEnable',
    label: 'Enable Text Overlay',
    section: 'Overlay',
    type: 'switch',
    defaultValue: false,
    restartRequired: true,
  },
  {
    key: 'rpiCameraTextOverlay',
    label: 'Overlay Text',
    section: 'Overlay',
    type: 'text',
    defaultValue: '%Y-%m-%d %H:%M:%S - MediaMTX',
    showIf: { key: 'rpiCameraTextOverlayEnable', value: true },
    description: 'Supports strftime format codes.',
    restartRequired: true,
  },
  // --- Encoding ---
  {
    key: 'rpiCameraDenoise',
    label: 'Denoise',
    section: 'Encoding',
    type: 'select',
    defaultValue: 'cdn_off',
    restartRequired: false,
    options: [
      { value: 'cdn_off', label: 'Off' },
      { value: 'cdn_fast', label: 'Fast' },
      { value: 'cdn_hq', label: 'High Quality' },
    ],
  },
  {
    key: 'rpiCameraFPS',
    label: 'FPS',
    section: 'Encoding',
    type: 'number',
    min: 1,
    max: 120,
    step: 1,
    defaultValue: 30,
    restartRequired: true,
  },
  {
    key: 'rpiCameraBitrate',
    label: 'Bitrate (kbps)',
    section: 'Encoding',
    type: 'number',
    min: 100,
    max: 50000,
    step: 100,
    defaultValue: 2000000, // stored in bps internally; transform handles display ↔ storage
    restartRequired: true,
    transform: {
      fromBackend: (v: number) => (typeof v === 'number' && !isNaN(v) ? Math.round(v / 1000) : 0),
      toBackend: (v: number) => (typeof v === 'number' && !isNaN(v) ? v * 1000 : 0),
    },
  },
  {
    key: 'rpiCameraIDRPeriod',
    label: 'IDR Period (frames)',
    section: 'Encoding',
    type: 'number',
    min: 1,
    max: 300,
    step: 1,
    defaultValue: 60,
    restartRequired: true,
  },
  {
    key: 'rpiCameraWidth',
    label: 'Width',
    section: 'Encoding',
    type: 'number',
    min: 320,
    max: 4608,
    step: 1,
    defaultValue: 1280,
    restartRequired: true,
  },
  {
    key: 'rpiCameraHeight',
    label: 'Height',
    section: 'Encoding',
    type: 'number',
    min: 240,
    max: 3496,
    step: 1,
    defaultValue: 720,
    restartRequired: true,
  },
  {
    key: 'rpiCameraHFlip',
    label: 'Horizontal Flip',
    section: 'Encoding',
    type: 'switch',
    defaultValue: false,
    restartRequired: true,
  },
  {
    key: 'rpiCameraVFlip',
    label: 'Vertical Flip',
    section: 'Encoding',
    type: 'switch',
    defaultValue: false,
    restartRequired: true,
  },
];
