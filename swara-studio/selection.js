import {RAGA_LIST,noteName} from './music.js?v=20261116-13';

export const SHRUTHIS=[54,55,56,57,58,59,60,61];

export function selectionFields(prefix,{base,raga}){
  return `<label class="shared-select" for="${prefix}-base">Base shruthi<select id="${prefix}-base">${SHRUTHIS.map(midi=>`<option value="${midi}"${midi===base?' selected':''}>${noteName(midi)}</option>`).join('')}</select></label>
    <label class="shared-select" for="${prefix}-raga">Raga<select id="${prefix}-raga">${RAGA_LIST.map(item=>`<option value="${item.id}"${item.id===raga?' selected':''}>${item.name}</option>`).join('')}</select></label>`;
}
