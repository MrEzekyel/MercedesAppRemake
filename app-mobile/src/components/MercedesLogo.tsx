/**
 * Il logo Mercedes fornito dall'utente, renderizzato cosi' com'e' (il suo
 * file .svg originale, non un ridisegno): qui si tocca solo la dimensione.
 */
import { SvgXml } from "react-native-svg";
import { MERCEDES_LOGO_SVG } from "./mercedesLogoSvg";

export function MercedesLogo({ size = 56 }: { size?: number }) {
  return <SvgXml xml={MERCEDES_LOGO_SVG} width={size} height={size} />;
}
