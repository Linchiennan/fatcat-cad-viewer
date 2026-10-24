import {SelectionIcon} from './ViewerToolbar';
import {TrashIcon} from './Icons';
import {IconTile} from './IconTile';
import {useI18n} from '../i18n/translations';
export function SelectionBar({tool,count,onTool,onDelete}:{tool:'single'|'box';count:number;onTool(t:'single'|'box'):void;onDelete():void}){
 const {t}=useI18n();
 return <section className="markup-bar selection-bar" aria-label={t('select.tools')} data-fit="toolbar"><div className="markup-row">
  <IconTile name={t('select.single')} label={t('select.single')} tip={t('select.singleTip')} pressed={tool==='single'} onClick={()=>onTool('single')}><SelectionIcon/></IconTile>
  <IconTile name={t('select.box')} label={t('select.box')} tip={t('select.boxTip')} pressed={tool==='box'} onClick={()=>onTool('box')}><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="4" y="4" width="16" height="16" strokeDasharray="4 2"/></svg></IconTile>
  <IconTile name={t('select.delete')} label={t('select.delete')} tip={t('select.deleteTip')} disabled={!count} onClick={onDelete}><TrashIcon/></IconTile>
  <span className="selection-count" role="status" aria-live="polite">{t('select.count',{N:count})}</span>
 </div></section>;
}
