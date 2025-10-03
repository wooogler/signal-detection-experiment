interface LineSegmentProps {
  length: number; // length in inches
  tilt: number; // tilt in degrees
  centerX: number;
  centerY: number;
  color?: string;
}

export default function LineSegment({
  length,
  tilt,
  centerX,
  centerY,
  color = "black"
}: LineSegmentProps) {
  const pixelsPerInch = 96; // Standard web pixels per inch
  const lengthInPixels = length * pixelsPerInch;

  const radians = (tilt * Math.PI) / 180;
  const halfLength = lengthInPixels / 2;

  const x1 = centerX - halfLength * Math.cos(radians);
  const y1 = centerY + halfLength * Math.sin(radians);
  const x2 = centerX + halfLength * Math.cos(radians);
  const y2 = centerY - halfLength * Math.sin(radians);

  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={color}
      strokeWidth={0.1 * pixelsPerInch}
    />
  );
}