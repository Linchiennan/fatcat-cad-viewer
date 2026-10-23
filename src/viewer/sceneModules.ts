// Our DxfScene patches in the order T14 8.1-5 asks for. Each install wraps Build, so the last one
// installed runs first: engineering → XCLIP → fonts → measurement index → dxf-viewer's own Build.
import { installMeasurementPreparation } from "./measurementGeometry";
import { installCadFontScene } from "./cadFontsScene";
import { installXclipScene } from "./xclipScene";
import { installEngineeringScene } from "./engineering";

type Any = any;

export function installSceneModules(sceneClass: Any): void {
  const p = sceneClass.prototype;
  if (p.fatcatModulesInstalled) return;
  p.fatcatModulesInstalled = true;
  installMeasurementPreparation(sceneClass);
  installCadFontScene(sceneClass);
  installXclipScene(sceneClass);
  installEngineeringScene(sceneClass);
}
