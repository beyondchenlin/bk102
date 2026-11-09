// 可选的面板返回契约：业务组件只声明层级/返回控件，历史仍由移动宿主管理。
export function applyPanelNavigation(source) {
  const replace=(before,after)=>{if(source.split(before).length!==2)throw Error('面板返回补丁锚点不唯一: '+before.slice(0,80));source=source.replace(before,after);};
  replace("                'data-mobile-preview-full',", "                'data-mobile-preview-full',\n                'data-dsh-panel-navigation',\n                'data-dsh-panel-depth',");
  replace('        const el = document.querySelector(PANEL_SUBPAGE_BACK);', `        // DSH_PANEL_NAVIGATION_V1: 只读取当前面板，忽略退出动画中的副本。
        const panel = panelElement();
        const root = panel?.matches('[data-dsh-panel-navigation="v1"]') ? panel : panel?.querySelector('[data-dsh-panel-navigation="v1"]');
        if (root) {
            const depth = Number(root.getAttribute('data-dsh-panel-depth'));
            const control = root.querySelector('button[data-dsh-panel-back="true"]');
            return Number.isInteger(depth) && depth > 0 && depth <= 24 && control instanceof HTMLButtonElement && !control.disabled && control.getClientRects().length ? control : null;
        }
        const el = document.querySelector(PANEL_SUBPAGE_BACK);`);
  replace('    let lastControl = null;', '    let lastLevel = 0;');
  replace('    function selfBack() {', '    function selfBack(count = 1) {');
  replace('            history.back();', '            history.go(-count);');
  replace("        return control.className.includes('_moreBack') ? 1 : 2;", `        if (control.getAttribute('data-dsh-panel-back') === 'true') {
            const depth = Number(control.getAttribute('data-dsh-panel-depth'));
            return Number.isInteger(depth) && depth >= 0 && depth <= 24 ? depth : 0;
        }
        return control.className.includes('_moreBack') ? 1 : 2;`);
  replace(`                if (rootArmed) {
                    rootArmed = false;
                    selfBack();
                }
                lastControl = null;`, `                const count = (rootArmed ? 1 : 0) + extraArmed;
                rootArmed = false;
                extraArmed = 0;
                if (count) selfBack(count);
                lastLevel = 0;`);
  replace('            const previous = levelOf(lastControl);', '            const previous = lastLevel;');
  replace('            lastControl = control;', '            lastLevel = current;');
  replace(`                if (!climbed)
                    armExtra();`, `                if (!climbed) {
                    const count = control?.getAttribute('data-dsh-panel-back') === 'true' ? current - previous : 1;
                    for (let i = 0; i < count; i++) armExtra();
                }`);
  replace(`                extraArmed -= 1;
                selfBack();`, `                const count = Math.min(extraArmed, previous - current);
                extraArmed -= count;
                selfBack(count);`);
  replace(`            if (rootArmed) {
                rootArmed = false;
                selfBack();
            }`, `            const count = (rootArmed ? 1 : 0) + extraArmed;
            rootArmed = false;
            extraArmed = 0;
            if (count) selfBack(count);`);
  // 明确采用契约的面板逐层返回；其他侧栏面板保持原点击退出行为。
  replace('        subpageOpen,\n        task:', `        subpageOpen,
        rowBack: () => {
            const control = subpageControl();
            if (control?.getAttribute('data-dsh-panel-back') === 'true') back();
            else exit();
        },
        task:`);
  replace('(ctx, panelExit.exit);', '(ctx, panelExit.rowBack);');
  // 契约面板已有可见返回时，不再叠加宿主FAB。契约控件仍保留供系统返回调用。
  replace("            if (heroPhase() && !drawerOpen() && fab === null) {", "            const ownBack = panelExit?.ownsBackControl?.() === true;\n            if (heroPhase() && !drawerOpen() && !ownBack && fab === null) {");
  replace("            else if ((!heroPhase() || drawerOpen()) && fab !== null) {", "            else if ((!heroPhase() || drawerOpen() || ownBack) && fab !== null) {");
  replace('        rowBack: () => {', `        ownsBackControl: () => {
            const panel = panelElement();
            const root = panel?.matches('[data-dsh-panel-navigation="v1"]') ? panel : panel?.querySelector('[data-dsh-panel-navigation="v1"]');
            const control = root?.querySelector('button[data-dsh-panel-back="true"]');
            const owns = control instanceof HTMLButtonElement && !control.disabled && control.getClientRects().length > 0;
            if (root && root.getAttribute('data-dsh-own-back') !== String(owns)) root.setAttribute('data-dsh-own-back', String(owns));
            return owns;
        },
        rowBack: () => {`);
  return source;
}
