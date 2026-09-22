/**
 * Anteprima del percorso nelle righe dell'elenco.
 *
 * Disegna il tracciato VERO, semplificato lato server: non una forma
 * decorativa generata dall'id del viaggio, che sembrerebbe un percorso
 * senza esserlo. Se il tracciato manca (viaggio senza GPS) si ripiega su
 * un glifo neutro, che non finge di essere una mappa.
 */
import Svg, { Circle, Polyline } from "react-native-svg";
import { colors } from "../theme";

interface Props {
  /** Coppie [longitudine, latitudine] come da GeoJSON. */
  route: [number, number][] | undefined;
  width: number;
  height: number;
}

const PAD = 3;

export function RouteSpark({ route, width, height }: Props) {
  if (!route || route.length < 2) {
    return (
      <Svg width={width} height={height}>
        <Circle cx={PAD + 2} cy={height - PAD - 2} r={2.2} fill="rgba(255,255,255,0.28)" />
        <Polyline
          points={`${PAD + 2},${height - PAD - 2} ${width - PAD - 2},${PAD + 2}`}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={1.4}
          strokeDasharray="2 3"
          fill="none"
        />
        <Circle cx={width - PAD - 2} cy={PAD + 2} r={2.2} fill="rgba(255,255,255,0.28)" />
      </Svg>
    );
  }

  const lons = route.map((p) => p[0]);
  const lats = route.map((p) => p[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  // Una sola scala per entrambi gli assi: scalarli separatamente
  // deformerebbe il percorso fino a renderlo irriconoscibile.
  const spanLon = Math.max(maxLon - minLon, 1e-6);
  const spanLat = Math.max(maxLat - minLat, 1e-6);
  const scale = Math.min((width - PAD * 2) / spanLon, (height - PAD * 2) / spanLat);
  const offsetX = (width - spanLon * scale) / 2;
  const offsetY = (height - spanLat * scale) / 2;

  const project = ([lon, lat]: [number, number]): [number, number] => [
    offsetX + (lon - minLon) * scale,
    // La latitudine cresce verso nord, la y dello schermo verso il basso.
    offsetY + (maxLat - lat) * scale,
  ];

  const points = route.map(project);
  const [sx, sy] = points[0];
  const [ex, ey] = points[points.length - 1];

  return (
    <Svg width={width} height={height}>
      <Polyline
        points={points.map(([x, y]) => `${x},${y}`).join(" ")}
        stroke={colors.accent}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
      <Circle cx={sx} cy={sy} r={2.4} fill="rgba(255,255,255,0.75)" />
      <Circle cx={ex} cy={ey} r={2.4} fill={colors.accent} />
    </Svg>
  );
}
