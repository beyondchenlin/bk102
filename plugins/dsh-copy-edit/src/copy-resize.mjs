// 偏好仅属于浏览器；缩窗只收敛展示宽度，不覆盖用户记忆。
export function fitCopySidebar(available,preferred){
  const width=Number.isFinite(available)?Math.max(0,available):0,desktop=width>760,min=200,max=Math.max(min,Math.min(720,width-428));
  const value=typeof preferred==='number'&&Number.isFinite(preferred)?preferred:280;
  return {desktop,min,max,width:Math.max(min,Math.min(max,value))};
}
