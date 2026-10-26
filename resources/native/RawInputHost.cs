using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

// Optional development prototype. Only configured-key/modifier state exists in memory.
// No key text, device identifiers, raw packets or arbitrary keystrokes leave this process.
class RawInputHost : NativeWindow, IDisposable {
 [StructLayout(LayoutKind.Sequential)] struct DEVICE { public ushort page,usage; public uint flags; public IntPtr target; }
 [StructLayout(LayoutKind.Sequential)] struct HEADER { public uint type,size;public IntPtr device,wParam; }
 [StructLayout(LayoutKind.Sequential)] struct KEYBOARD { public ushort make,flags,reserved,vkey;public uint message,extra; }
 [DllImport("user32.dll",SetLastError=true)] static extern bool RegisterRawInputDevices(DEVICE[] devices,uint count,uint size);
 [DllImport("user32.dll",SetLastError=true)] static extern uint GetRawInputData(IntPtr raw,uint command,IntPtr data,ref uint size,uint headerSize);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
 [DllImport("user32.dll")] static extern IntPtr GetKeyboardLayout(uint thread);
 [DllImport("user32.dll")] static extern uint MapVirtualKeyEx(uint code,uint mode,IntPtr layout);
 [DllImport("user32.dll")] static extern bool PostMessage(IntPtr window,uint message,IntPtr w,IntPtr l);
 readonly HashSet<int> modifiers=new HashSet<int>();
 readonly HashSet<IntPtr> targetDown=new HashSet<IntPtr>();
 readonly int targetKey;readonly bool ctrl,alt,shift,super;
 IntPtr lastLayout=IntPtr.Zero;
 bool disposed;
 RawInputHost(string binding) {
  var parts=binding.Split('+');string key=parts[parts.Length-1];
  foreach(string p in parts) {if(p=="Ctrl")ctrl=true;else if(p=="Alt")alt=true;else if(p=="Shift")shift=true;else if(p=="Super")super=true;}
  int number;
  if(key.Length>1&&key[0]=='F'&&int.TryParse(key.Substring(1),out number)&&number>=1&&number<=24&&number!=12)targetKey=111+number;
  else if(key.Length==1&&((key[0]>='A'&&key[0]<='Z')||(key[0]>='0'&&key[0]<='9'))&&(ctrl||alt))targetKey=key[0];
  else throw new ArgumentException("Unsupported shortcut.");
  CreateHandle(new CreateParams { Caption="Cargo Run optional Raw Input sink",Parent=new IntPtr(-3) });
  // INPUTSINK only: never NOLEGACY, CAPTUREMOUSE, NOHOTKEYS or suppression flags.
  var devices=new[]{new DEVICE {page=1,usage=6,flags=0x100|0x2000,target=Handle}};
  if(!RegisterRawInputDevices(devices,1,(uint)Marshal.SizeOf(typeof(DEVICE))))throw new Win32Exception();
 }
 bool Has(int left,int right){return modifiers.Contains(left)||modifiers.Contains(right);}
 void Read(IntPtr raw) {
  uint size=0,header=(uint)Marshal.SizeOf(typeof(HEADER));
  if(GetRawInputData(raw,0x10000003,IntPtr.Zero,ref size,header)==uint.MaxValue||size<header+16||size>4096)return;
  IntPtr data=Marshal.AllocHGlobal((int)size);
  try {
   uint read=GetRawInputData(raw,0x10000003,data,ref size,header);
   if(read==uint.MaxValue||read<header+16)return;
   var h=(HEADER)Marshal.PtrToStructure(data,typeof(HEADER));if(h.type!=1)return;
   var k=(KEYBOARD)Marshal.PtrToStructure(IntPtr.Add(data,(int)header),typeof(KEYBOARD));
   if(k.vkey==255||k.make==255)return;
   uint pid;IntPtr layout=GetKeyboardLayout(GetWindowThreadProcessId(GetForegroundWindow(),out pid));
   if(layout!=lastLayout){modifiers.Clear();targetDown.Clear();lastLayout=layout;}
   bool up=(k.flags&1)!=0,extended=(k.flags&2)!=0;
   int key=k.vkey;
   if(key==16)key=k.make==0x36?161:160;
   else if(key==17)key=extended?163:162;
   else if(key==18)key=extended?165:164;
   else if(k.make!=0){uint mapped=MapVirtualKeyEx((uint)(k.make|(extended?0xE000:0)),3,layout);if(mapped!=0)key=(int)mapped;}
   if((key>=160&&key<=165)||key==91||key==92){if(up)modifiers.Remove(key);else modifiers.Add(key);return;}
   if(key!=targetKey)return;
   if(up){targetDown.Remove(h.device);return;}
   // One invocation per target press, including when a chord is initially incomplete.
   if(targetDown.Count>=16){targetDown.Clear();return;}
   if(!targetDown.Add(h.device))return;
   // AltGr is normally synthesized Ctrl+RightAlt: reject it rather than matching text entry.
   if(modifiers.Contains(165))return;
   if(Has(162,163)==ctrl&&Has(164,165)==alt&&Has(160,161)==shift&&Has(91,92)==super)
    Console.WriteLine("{\"event\":\"shortcut\"}");
  } finally {Marshal.FreeHGlobal(data);}
 }
 protected override void WndProc(ref Message m) {
  if(m.Msg==0xFF){try{Read(m.LParam);}catch{Console.WriteLine("{\"event\":\"error\",\"code\":0}");Application.ExitThread();}}
  else if(m.Msg==0xFE){modifiers.Clear();targetDown.Clear();}
  else if(m.Msg==0x10){Application.ExitThread();}
  // Required default processing/cleanup for WM_INPUT; never consume gameplay input.
  base.WndProc(ref m);
 }
 public void Dispose(){
  if(disposed)return;disposed=true;
  RegisterRawInputDevices(new[]{new DEVICE {page=1,usage=6,flags=1,target=IntPtr.Zero}},1,(uint)Marshal.SizeOf(typeof(DEVICE)));
  modifiers.Clear();targetDown.Clear();DestroyHandle();
 }
 [STAThread] static void Main(string[] args){
  try {
   if(args.Length!=1)return;
   Application.SetUnhandledExceptionMode(UnhandledExceptionMode.ThrowException);
   using(var host=new RawInputHost(args[0])){
    IntPtr window=host.Handle;
    var input=new Thread(()=>{while(Console.ReadLine()!=null){}PostMessage(window,0x10,IntPtr.Zero,IntPtr.Zero);});
    input.IsBackground=true;input.Start();
    Console.WriteLine("{\"event\":\"ready\"}");
    Application.Run();
   }
  }catch(Win32Exception e){Console.WriteLine("{\"event\":\"error\",\"code\":"+e.NativeErrorCode+"}");Environment.ExitCode=1;}
  catch{Console.WriteLine("{\"event\":\"error\",\"code\":0}");Environment.ExitCode=1;}
 }
}
