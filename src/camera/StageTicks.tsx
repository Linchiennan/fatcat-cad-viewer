// 施工前／施工中／施工後 ticks (用戶 2026-11-23：「下方增加一排 施工前 施工中 施工後，這三個選項前有口能打勾用」): one at
// most, pressing the ticked one again clears it. Used in the list's 改白板 form; in the camera the boxes on the board are
// tapped instead (用戶 2026-11-23：「拍照模式不要出現施工前中後，只有白板有」).
import { useI18n } from "../i18n/translations";
import type { BoardStage } from "./types";
import { STAGES } from "./whiteboard";

export function StageTicks({ value, onChange }: { value: BoardStage | undefined; onChange(stage: BoardStage | undefined): void }) {
  const { t } = useI18n();
  return (
    <div className="camera-stage-ticks" role="group" aria-label={t("camera.stage")} title={t("camera.stage")}>
      {STAGES.map(([k]) => (
        <button key={k} type="button" role="checkbox" aria-checked={value === k} onClick={() => onChange(value === k ? undefined : k)}>
          <span className="camera-tick" aria-hidden="true">{value === k ? "✓" : ""}</span>{t(`camera.stage.${k}` as "camera.stage.before")}
        </button>
      ))}
    </div>
  );
}
