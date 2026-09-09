async (page) => {
  const errors = [];
  await page.goto("http://127.0.0.1:1421");
  await page.evaluate(() => localStorage.clear());
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => {
    const layers = Array.from({length:8}, () => Array.from({length:4}, () => Array(4).fill(0x29)));
    for (let position=0;position<13;position++) layers[0][Math.floor(position/4)][position%4]=0x7e02+position;
    const encoders = Array.from({length:8}, (_,layer) => ({layer, clockwise:0xa9, counter_clockwise:0xaa}));
    let unlocked = false;
    let rgb = {mode:2, speed:80, hue:32, saturation:120, brightness:90};
    let macros = Array(128).fill(0);
    window.qaCalls = [];
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      window.qaCalls.push({command,args});
      switch(command) {
        case "list_agentpad_devices": return [{path:"qa-vial",label:"AgentPad13 · Vial simulado"}];
        case "connect_agentpad": return {layers,encoders,unlockStatus:{unlocked,in_progress:false,required_keys:[{row:0,column:0},{row:3,column:0}]}};
        case "get_vialrgb": return {info:{protocol_version:1,maximum_brightness:128,supported_modes:[0,2,6,13]},state:rgb};
        case "get_macros": return {count:16,bytes:macros};
        case "begin_unlock": return;
        case "poll_unlock": unlocked=true; return {unlocked:true,in_progress:false,remaining_polls:0};
        case "save_keymap_changes":
          for(const c of args.changes) layers[c.layer][c.row][c.column]=c.keycode;
          return {applied:args.changes};
        case "save_encoder_change": {
          const c=args.change;
          encoders[c.layer][c.direction==="clockwise"?"clockwise":"counter_clockwise"]=c.keycode;
          return encoders[c.layer];
        }
        case "save_vialrgb": rgb=args.next; return rgb;
        case "save_macros": macros=args.next; return {count:16,bytes:macros};
        case "export_text": return true;
        case "lock_device": unlocked=false; return {unlocked:false,in_progress:false,required_keys:[]};
        case "disconnect_agentpad": return;
        default: throw Error("Unexpected command "+command);
      }
    }};
  });
  await page.reload();
  await page.screenshot({path:"output/playwright/home.png",fullPage:true});
  await page.getByRole("button",{name:"Buscar AgentPad13",exact:true}).click();
  await page.getByRole("button",{name:"Conectar",exact:true}).click();
  await page.getByRole("button",{name:"Iniciar desbloqueo físico"}).click();
  await page.getByRole("button",{name:"Bloquear edición"}).waitFor();
  await page.getByRole("button",{name:"Mapa de teclas",exact:true}).click();
  await page.getByRole("button",{name:"Orden vertical",exact:true}).click();
  if (!await page.getByRole("button",{name:"SW5",exact:true}).innerText().then(text=>text.includes("AG01"))) throw Error("Vertical agent order incorrect");
  await page.getByRole("button",{name:"Deshacer",exact:true}).click();
  await page.getByRole("button",{name:"Intercambiar tecla y LED",exact:true}).click();
  if (!await page.getByRole("button",{name:"SW7",exact:true}).innerText().then(text=>text.includes("AG00"))) throw Error("Agent did not move to SW7");
  await page.getByRole("button",{name:"SW7",exact:true}).click();
  await page.getByRole("button",{name:"ACT07",exact:true}).click();
  if(await page.evaluate(()=>qaCalls.some(c=>c.command.startsWith("save_")))) throw Error("Premature device write");
  await page.getByRole("button",{name:"Deshacer",exact:true}).click();
  await page.getByRole("button",{name:"Rehacer",exact:true}).click();
  await page.screenshot({path:"output/playwright/keymap.png",fullPage:true});
  await page.getByRole("button",{name:"Guardar en AgentPad",exact:true}).first().click();
  await page.getByText("Sin cambios pendientes",{exact:true}).waitFor();
  await page.getByRole("button",{name:"Iluminación",exact:true}).click();
  if(await page.getByRole("slider").count()) throw Error("L0 exposes RGB edits");
  await page.getByRole("combobox",{name:"Capa de iluminación"}).selectOption("1");
  await page.getByRole("slider",{name:"Brillo",exact:true}).fill("45");
  await page.screenshot({path:"output/playwright/lighting.png",fullPage:true});
  await page.getByRole("button",{name:"Guardar en AgentPad",exact:true}).first().click();
  await page.getByText("Sin cambios pendientes",{exact:true}).waitFor();
  await page.getByRole("button",{name:"Macros y acciones",exact:true}).click();
  await page.getByLabel("Texto de la macro",{exact:true}).fill("review");
  await page.getByRole("button",{name:"Guardar en AgentPad",exact:true}).first().click();
  await page.getByText("Sin cambios pendientes",{exact:true}).waitFor();
  await page.getByRole("button",{name:"Perfiles",exact:true}).click();
  await page.getByRole("button",{name:"Nuevo perfil"}).click();
  await page.getByLabel("Nombre del perfil").fill("QA Browser");
  await page.getByRole("button",{name:"Guardar perfil",exact:true}).click();
  await page.getByText("Este perfil ya coincide con el teclado conectado.",{exact:true}).waitFor();
  await page.getByRole("button",{name:"Exportar JSON"}).click();
  await page.screenshot({path:"output/playwright/profiles.png",fullPage:true});
  await page.getByRole("button",{name:"Diagnóstico",exact:true}).click();
  await page.getByRole("button",{name:"Exportar",exact:true}).click();
  await page.getByText("Informe exportado.",{exact:true}).waitFor();
  await page.getByRole("button",{name:"Ajustes",exact:true}).click();
  await page.getByRole("checkbox",{name:"Alto contraste"}).check();
  await page.reload();
  await page.waitForFunction(()=>document.documentElement.classList.contains("high-contrast"));
  await page.getByRole("button",{name:"Perfiles",exact:true}).click();
  await page.getByRole("button",{name:/QA Browser/}).first().waitFor();
  await page.setViewportSize({width:1000,height:680});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw Error("Horizontal overflow at native minimum");
  await page.screenshot({path:"output/playwright/minimum-window.png",fullPage:true});
  if(errors.length) throw Error(JSON.stringify(errors));
  console.log("PASS: unlock, keymap, undo/redo, explicit save, protected L0 RGB, lighting, macros, profile persistence/export, diagnostics, preferences, minimum viewport; zero page errors. HID and native export mocked.");
}
