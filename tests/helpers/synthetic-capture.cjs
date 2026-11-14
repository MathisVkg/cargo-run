// Test-only replacement in an ignored build copy. Never imported by application source.
// No desktopCapturer calls, native capture helper, game process enumeration or focus changes.
const fs = require("node:fs"),
  path = require("node:path"),
  ts = require("typescript");
const { execFileSync } = require("node:child_process"),
  { PassThrough } = require("node:stream"),
  { EventEmitter } = require("node:events");
const assert = require("node:assert/strict");
function entry() {
  assert.equal(process.env.CARGO_RUN_SYNTHETIC_CAPTURE, "1");
  const file = path.resolve("out/main/index.js"),
    source = fs.readFileSync(file, "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  let target;
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(ast) === "backend" &&
      node.initializer &&
      ts.isNewExpression(node.initializer) &&
      node.initializer.expression.getText(ast) === "WindowCaptureBackend"
    ) {
      assert(!target);
      target = node.initializer;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert(target, "Built capture backend must match the audited adapter target");
  const replacement = `({
    available:()=>({available:true,error:null}),
    displays:async()=>[{id:"fixture",label:"Synthetic fixture",width:1920,height:1080,primary:true}],
    context:async()=>({inspectedAt:new Date().toISOString(),foregroundProcess:"FixtureRaster.exe",foregroundPid:0,appElevated:false,foregroundElevated:false,gameElevated:false,gameVisible:!!process.env.CARGO_RUN_SYNTHETIC_IMAGE&&node_fs.existsSync(process.env.CARGO_RUN_SYNTHETIC_IMAGE)}),
    feedback:async()=>{},close:async()=>{},
    capture:async(id)=>{ const image=process.env.CARGO_RUN_SYNTHETIC_IMAGE;
      if(!image||!node_fs.existsSync(image))throw Error("Star Citizen render window unavailable (synthetic failure; no desktop queried).");
      node_fs.copyFileSync(image,node_path.join(directory,id+".png"));node_fs.copyFileSync(image,node_path.join(directory,id+".thumb.png"));
      return {backend:"Window",fallback:false,displayId:"fixture",displayLabel:"Synthetic fixture raster",width:1920,height:1080,bytes:node_fs.statSync(image).size,soundRequested:false};
    }
  })`;
  const output = path.resolve("out/main/isolated-test.cjs");
  const isolated =
    source.slice(0, target.getStart(ast)) +
    replacement +
    source.slice(target.getEnd());
  assert.equal((isolated.match(/electron\.globalShortcut,/g) || []).length, 1);
  fs.writeFileSync(
    output,
    isolated.replace(
      "electron.globalShortcut,",
      "({register:()=>true,unregister:()=>{},isRegistered:()=>true}),",
    ),
  );
  return output;
}
function imagePath(folder) {
  return path.resolve(folder, "synthetic-ocr.png");
}
function startFixture(folder) {
  const source = fs.readFileSync("tests/native/OcrFixture.cs", "utf8");
  const start = source.indexOf(" OcrFixture(){"),
    end = source.indexOf(" void Line(");
  assert(start > 0 && end > start);
  let raster =
    source.slice(0, start) +
    ` OcrFixture(){ClientSize=new Size(1920,1080);BackColor=Color.FromArgb(20,24,32);}
` +
    source.slice(end);
  raster =
    raster.slice(0, raster.indexOf(" [STAThread]")) +
    ` [STAThread]static void Main(string[] args){using(var form=new OcrFixture())using(var bitmap=new Bitmap(1920,1080)){form.DrawToBitmap(bitmap,new Rectangle(0,0,1920,1080));bitmap.Save(args[0],System.Drawing.Imaging.ImageFormat.Png);}}
}
`;
  const cs = path.resolve(folder, "FixtureRaster.cs"),
    exe = path.resolve(folder, "FixtureRaster.exe"),
    image = imagePath(folder);
  fs.writeFileSync(cs, raster);
  execFileSync(
    path.join(
      process.env.SystemRoot,
      "Microsoft.NET/Framework64/v4.0.30319/csc.exe",
    ),
    [
      "/nologo",
      "/platform:x64",
      "/target:exe",
      "/reference:System.Drawing.dll",
      "/reference:System.Windows.Forms.dll",
      "/out:" + exe,
      cs,
    ],
    { windowsHide: true, stdio: "inherit" },
  );
  execFileSync(exe, [image], { windowsHide: true });
  const fixture = new EventEmitter();
  fixture.exitCode = null;
  fixture.stdout = new PassThrough();
  fixture.stdin = {
    write(command) {
      if (command.trim() === "close") {
        if (fs.existsSync(image)) fs.unlinkSync(image);
        fixture.exitCode = 0;
        setImmediate(() => fixture.emit("exit", 0));
      }
    },
  };
  fixture.kill = () => {
    if (fs.existsSync(image)) fs.unlinkSync(image);
  };
  setImmediate(() => fixture.stdout.write("READY\n"));
  return fixture;
}
module.exports = { entry, startFixture, imagePath };
