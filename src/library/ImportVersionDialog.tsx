import { Dialog } from './LibraryDialog';
import type { ImportChoice, ImportConflict } from './drawingLibrary';
import './library.css';
import './importVersion.css';

const dateText = (value: number) => Number.isFinite(value) && value > 0
  ? `${new Date(value).toLocaleString('zh-TW', { hour12: false })}.${String(value % 1000).padStart(3, '0')}（本機時區）`
  : '未知（無法確認）';
export function ImportVersionDialog({ conflict, onChoose }: { conflict: ImportConflict; onChoose(choice: ImportChoice): void }) {
  return <div onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onChoose('cancel');}}}>
    <Dialog className="lib-dialog import-version-dialog" role="alertdialog" label="同名檔案確認" onCancel={()=>onChoose('cancel')}>
      <h3>同名檔案確認</h3>
      <div className="import-version-details">
      <strong style={{overflowWrap:'anywhere'}}>{conflict.incoming.name}</strong>
      <p>{conflict.reasons.some(reason=>reason.endsWith('不同')) ? '與圖庫版本不同' : '無法確認是否與圖庫版本相同'}（{conflict.reasons.join('／')}）</p>
      <p>僅比較目前目標資料夾；日期差異不代表內容較新。</p>
      <dl style={{fontSize:13,overflowWrap:'anywhere',margin:'12px 0'}}>
        <dt>來源檔大小</dt><dd style={{margin:'0 0 8px'}}>{conflict.incoming.size.toLocaleString()} bytes</dd>
        <dt>來源檔修改日期</dt><dd style={{margin:'0 0 8px'}}>{dateText(conflict.incoming.lastModified)}</dd>
        <dt>圖庫副本大小</dt><dd style={{margin:'0 0 8px'}}>{conflict.existing.size.toLocaleString()} bytes</dd>
        <dt>圖庫副本的來源修改日期</dt><dd style={{margin:0}}>{dateText(conflict.existing.lastModified)}</dd>
      </dl>
      <p>更新保留圖庫位置與名稱。原版本的註記與量測保留，不會自動套用到不同內容的新圖。</p>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:8,flexShrink:0}}>
        <button type="button" className="lib-primary" onClick={()=>onChoose('update')}>更新圖庫副本</button>
        <button type="button" className="lib-secondary" onClick={()=>onChoose('copy')}>另存一份</button>
        <button type="button" className="lib-secondary" onClick={()=>onChoose('cancel')}>取消</button>
      </div>
    </Dialog>
  </div>;
}
