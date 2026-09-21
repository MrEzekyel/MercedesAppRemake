/**
 * Vista dall'alto dell'auto, disegnata in vettoriale invece che fotografica.
 *
 * Una foto dall'alto renderebbe bene una sola casistica: per mostrare
 * "porta anteriore sinistra aperta" servirebbe una foto per ogni
 * combinazione (sono decine) e comunque non si potrebbe accendere un
 * singolo elemento. Qui ogni apertura e' un tracciato indipendente che si
 * illumina da sola, quindi qualunque combinazione di stato e' disegnabile.
 *
 * Proporzioni prese dalla W177: 4,42 m x 1,80 m, cioe' lunga circa 2,5
 * volte la larghezza. Il muso e' in alto.
 */
import Svg, {
  Circle,
  Defs,
  G,
  Path,
  Rect,
  Stop,
  LinearGradient as SvgGradient,
} from "react-native-svg";
import { colors } from "../theme";

export type Part =
  | "hood"
  | "trunk"
  | "door_front_left"
  | "door_front_right"
  | "door_rear_left"
  | "door_rear_right"
  | "window_front_left"
  | "window_front_right"
  | "window_rear_left"
  | "window_rear_right";

interface Props {
  width: number;
  /** Elementi da evidenziare come aperti. */
  open?: Set<Part>;
  /** Elemento selezionato al tocco, disegnato in accento. */
  highlight?: Part | null;
}

const VB_W = 200;
const VB_H = 430;

/**
 * Fianchi dritti, non un ovale: una vettura vista dall'alto e' quasi un
 * rettangolo, la curvatura sta solo nei quattro angoli.
 */
const BODY =
  "M52 20 C68 15 132 15 148 20 C160 24 166 38 167 56 L170 124 L170 332 " +
  "C170 364 163 388 150 397 C144 401 138 403 130 403 L70 403 " +
  "C62 403 56 401 50 397 C37 388 30 364 30 332 L30 124 L33 56 " +
  "C34 38 40 24 52 20 Z";

/** Vetri: parabrezza, tetto e lunotto formano il "greenhouse" centrale. */
const WINDSHIELD = "M76 128 L124 128 L137 170 L63 170 Z";
const ROOF = "M63 172 L137 172 L137 268 L63 268 Z";
const REAR_GLASS = "M63 270 L137 270 L128 306 L72 306 Z";

const PARTS: Record<Part, string> = {
  hood: "M58 46 L142 46 L148 124 L52 124 Z",
  trunk: "M64 312 L136 312 L140 388 L60 388 Z",
  door_front_left: "M32 176 L60 174 L60 236 L32 236 Z",
  door_rear_left: "M32 240 L60 240 L60 300 L33 298 Z",
  door_front_right: "M168 176 L140 174 L140 236 L168 236 Z",
  door_rear_right: "M168 240 L140 240 L140 300 L167 298 Z",
  window_front_left: "M63 178 L76 178 L76 234 L63 234 Z",
  window_rear_left: "M63 240 L76 240 L76 296 L63 296 Z",
  window_front_right: "M137 178 L124 178 L124 234 L137 234 Z",
  window_rear_right: "M137 240 L124 240 L124 296 L137 296 Z",
};

const WHEELS = [
  [18, 92],
  [166, 92],
  [18, 280],
  [166, 280],
] as const;

export function VehicleTopView({ width, open, highlight }: Props) {
  const height = (width / VB_W) * VB_H;

  const partFill = (part: Part): string => {
    if (highlight === part) return "rgba(79,143,209,0.5)";
    if (open?.has(part)) return "rgba(224,166,60,0.45)";
    return "transparent";
  };
  const partStroke = (part: Part): string => {
    if (highlight === part) return colors.accent;
    if (open?.has(part)) return colors.warning;
    return "rgba(255,255,255,0.14)";
  };

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${VB_W} ${VB_H}`} fill="none">
      <Defs>
        {/* Simmetrico: la luce di studio cade al centro, i fianchi restano in ombra */}
        <SvgGradient id="paint" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#0C1322" />
          <Stop offset="0.3" stopColor="#1E2E4E" />
          <Stop offset="0.5" stopColor="#25395F" />
          <Stop offset="0.7" stopColor="#1E2E4E" />
          <Stop offset="1" stopColor="#0C1322" />
        </SvgGradient>
      </Defs>

      {/* Ruote sotto la carrozzeria: sporgono appena, come dall'alto */}
      {WHEELS.map(([x, y]) => (
        <Rect key={`${x}-${y}`} x={x} y={y} width={17} height={58} rx={5} fill="#070B13" />
      ))}

      <Path d={BODY} fill="url(#paint)" stroke="rgba(255,255,255,0.28)" strokeWidth={1.4} />

      {/* Il vetro e' piu' scuro del lamierato, come in una foto dall'alto */}
      <Path d={WINDSHIELD} fill="#05080F" />
      <Path d={ROOF} fill="#070C16" stroke="rgba(255,255,255,0.1)" strokeWidth={0.9} />
      <Path d={REAR_GLASS} fill="#05080F" />

      {/* Fari e stop: decorativi, lo stato luci non arriva dall'auto */}
      <G>
        <Path d="M42 44 Q50 28 74 24" stroke="rgba(186,218,255,0.7)" strokeWidth={5} strokeLinecap="round" />
        <Path d="M158 44 Q150 28 126 24" stroke="rgba(186,218,255,0.7)" strokeWidth={5} strokeLinecap="round" />
        <Path d="M64 396 Q80 400 96 401" stroke="rgba(226,86,76,0.75)" strokeWidth={4} strokeLinecap="round" />
        <Path d="M136 396 Q120 400 104 401" stroke="rgba(226,86,76,0.75)" strokeWidth={4} strokeLinecap="round" />
      </G>

      {/* Specchietti */}
      <Circle cx="24" cy="164" r="6" fill="#0D1729" stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
      <Circle cx="176" cy="164" r="6" fill="#0D1729" stroke="rgba(255,255,255,0.25)" strokeWidth={1} />

      {/* Aperture: sempre tracciate, accese solo quando servono */}
      {(Object.keys(PARTS) as Part[]).map((part) => (
        <Path
          key={part}
          d={PARTS[part]}
          fill={partFill(part)}
          stroke={partStroke(part)}
          strokeWidth={highlight === part || open?.has(part) ? 1.8 : 0.9}
        />
      ))}
    </Svg>
  );
}
