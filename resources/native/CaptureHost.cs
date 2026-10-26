using System;
using System.IO;
using System.Text;
using System.Linq;
using System.Drawing;
using System.Drawing.Imaging;
using System.Media;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;

class CaptureHost {
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left,Top,Right,Bottom; }
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct MONITORINFOEX { public int cbSize; public RECT rcMonitor,rcWork; public uint flags; [MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)] public string device; }
  delegate bool MonitorEnum(IntPtr monitor,IntPtr hdc,ref RECT rect,IntPtr data);
  delegate bool WindowEnum(IntPtr window,IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr hdc,IntPtr rect,MonitorEnum callback,IntPtr data);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern bool GetMonitorInfo(IntPtr monitor,ref MONITORINFOEX info);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr window,uint flags);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr window,StringBuilder text,int count);
  [DllImport("user32.dll")] static extern bool EnumWindows(WindowEnum callback,IntPtr data);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  static JavaScriptSerializer json=new JavaScriptSerializer { MaxJsonLength=1048576 };
  static string root;
  static SoundPlayer success,warning;
  static MONITORINFOEX Info(IntPtr monitor) { var m=new MONITORINFOEX();m.cbSize=Marshal.SizeOf(m);if(!GetMonitorInfo(monitor,ref m))throw new Exception("Windows could not query this display.");return m; }
  static string Title(IntPtr w) { var b=new StringBuilder(512);GetWindowText(w,b,b.Capacity);return b.ToString(); }
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint processId);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access,bool inherit,uint processId);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr process,uint flags,StringBuilder name,ref uint size);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  static bool IsGame(IntPtr w) { if(w==IntPtr.Zero)return false;uint pid;GetWindowThreadProcessId(w,out pid);IntPtr handle=OpenProcess(0x1000,false,pid);if(handle==IntPtr.Zero)return false;try{var name=new StringBuilder(2048);uint size=2048;return QueryFullProcessImageName(handle,0,name,ref size)&&String.Equals(Path.GetFileName(name.ToString()),"StarCitizen.exe",StringComparison.OrdinalIgnoreCase);}finally{CloseHandle(handle);} }
  static List<KeyValuePair<IntPtr,MONITORINFOEX>> Monitors() { var list=new List<KeyValuePair<IntPtr,MONITORINFOEX>>();EnumDisplayMonitors(IntPtr.Zero,IntPtr.Zero,delegate(IntPtr h,IntPtr dc,ref RECT rect,IntPtr data){list.Add(new KeyValuePair<IntPtr,MONITORINFOEX>(h,Info(h)));return true;},IntPtr.Zero);return list; }
  static object[] Displays() { return Monitors().Select(m=>(object)new { id=m.Value.device,label=m.Value.device+(m.Value.flags==1?" (primary)":""),width=m.Value.rcMonitor.Right-m.Value.rcMonitor.Left,height=m.Value.rcMonitor.Bottom-m.Value.rcMonitor.Top,primary=m.Value.flags==1 }).ToArray(); }
  static void Feedback(bool good) { try { (good?success:warning).Play(); } catch { /* Capture result is independent of output-device availability. */ } }
  static object Capture(Dictionary<string,object> input) {
    Guid id;if(!Guid.TryParse(Convert.ToString(input["captureId"]),out id))throw new Exception("Invalid CaptureId.");
    string selected=Convert.ToString(input["displayId"]);
    var displays=Monitors();MONITORINFOEX target=new MONITORINFOEX();bool found=false;
    if(selected=="auto") {
      IntPtr game=GetForegroundWindow();
      if(!IsGame(game)) {
        var games=new List<IntPtr>();EnumWindows(delegate(IntPtr windowHandle,IntPtr data){if(IsWindowVisible(windowHandle)&&IsGame(windowHandle))games.Add(windowHandle);return true;},IntPtr.Zero);
        if(games.Count!=1)throw new Exception("Star Citizen display is unavailable or ambiguous. Focus Star Citizen in borderless mode, or select a display in OCR Settings for a desktop test.");
        game=games[0];
      }
      target=Info(MonitorFromWindow(game,2));found=true;
    } else foreach(var d in displays)if(d.Value.device==selected){target=d.Value;found=true;break;}
    if(!found)throw new Exception("Selected display is no longer connected. Refresh displays in OCR Settings.");
    int w=target.rcMonitor.Right-target.rcMonitor.Left,h=target.rcMonitor.Bottom-target.rcMonitor.Top;
    if(w<100||h<100||(long)w*h>33177600)throw new Exception("Display resolution is unsupported (maximum 33 megapixels).");
    string output=Path.Combine(root,id.ToString()+".png"),thumb=Path.Combine(root,id.ToString()+".thumb.png"),partial=output+".tmp";
    try {
      using(var bitmap=new Bitmap(w,h,PixelFormat.Format32bppArgb)) {
        using(var g=Graphics.FromImage(bitmap))g.CopyFromScreen(target.rcMonitor.Left,target.rcMonitor.Top,0,0,new Size(w,h),CopyPixelOperation.SourceCopy);
        int lit=0,samples=0;
        for(int y=0;y<h;y+=Math.Max(1,h/64))for(int x=0;x<w;x+=Math.Max(1,w/64)){Color c=bitmap.GetPixel(x,y);samples++;if(c.R>10||c.G>10||c.B>10)lit++;}
        if(lit<=samples/200)throw new Exception("Capture was empty or almost black. Use borderless fullscreen and disable protected overlays; no success confirmation was issued.");
        bitmap.Save(partial,ImageFormat.Png);
        if(new FileInfo(partial).Length>33554432)throw new Exception("Screenshot exceeds the 32 MiB per-image storage limit.");
        File.Move(partial,output);
        int tw=Math.Min(400,w),th=Math.Max(1,(int)((double)h*tw/w));
        using(var small=new Bitmap(bitmap,new Size(tw,th)))small.Save(thumb,ImageFormat.Png);
      }
      // Success audio is requested only after the main process commits queue metadata.
      return new { displayId=target.device,displayLabel=target.device,width=w,height=h,bytes=new FileInfo(output).Length,soundRequested=input.ContainsKey("sounds")&&Convert.ToBoolean(input["sounds"]) };
    } catch { foreach(string f in new[]{output,thumb,partial})try{if(File.Exists(f))File.Delete(f);}catch{}throw; }
  }
  static void Main(string[] args) {
    Console.InputEncoding=new UTF8Encoding(false);Console.OutputEncoding=new UTF8Encoding(false);
    if(args.Length!=3)return;
    root=Path.GetFullPath(args[0]);Directory.CreateDirectory(root);
    success=new SoundPlayer(args[1]);warning=new SoundPlayer(args[2]);try{success.Load();warning.Load();}catch{}
    try{SetProcessDpiAwarenessContext(new IntPtr(-4));SetThreadDpiAwarenessContext(new IntPtr(-4));}catch{}
    string line;
    while((line=Console.ReadLine())!=null) {
      string requestId=null;Dictionary<string,object> request=null;
      try {
        request=json.Deserialize<Dictionary<string,object>>(line);requestId=Convert.ToString(request["id"]);string op=Convert.ToString(request["op"]);object result;
        if(op=="displays")result=Displays();
        else if(op=="capture")result=Capture(request);
        else if(op=="feedback"){Feedback(request.ContainsKey("success")&&Convert.ToBoolean(request["success"]));result=new{played=true};}
        else if(op=="quit")break;
        else throw new Exception("Unsupported capture operation.");
        Console.WriteLine(json.Serialize(new{id=requestId,ok=true,result=result}));
      } catch(Exception e) {
        if(request!=null&&request.ContainsKey("sounds")&&Convert.ToBoolean(request["sounds"]))Feedback(false);
        Console.WriteLine(json.Serialize(new{id=requestId,ok=false,error=e.Message}));
      }
    }
    success.Dispose();warning.Dispose();
  }
}

