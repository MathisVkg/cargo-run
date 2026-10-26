using System;
using System.Drawing;
using System.Windows.Forms;
using System.Runtime.InteropServices;
using System.Threading;
class OcrFixture : Form {
 [DllImport("user32.dll")]static extern bool SetProcessDpiAwarenessContext(IntPtr value);
 [DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();
 bool black=false;
 OcrFixture(){
  Text="Cargo Run synthetic OCR fixture";FormBorderStyle=FormBorderStyle.None;StartPosition=FormStartPosition.Manual;Bounds=Screen.PrimaryScreen.Bounds;TopMost=true;DoubleBuffered=true;BackColor=Color.FromArgb(20,24,32);
  Shown+=(s,e)=>{Activate();Console.WriteLine("READY");};
  var thread=new Thread(()=>{string command;while((command=Console.ReadLine())!=null){string c=command;BeginInvoke((Action)(()=>{if(c=="close")Close();else if(c=="black"){black=true;Invalidate();Update();Console.WriteLine("BLACK");}else if(c=="keys"){if(GetForegroundWindow()!=Handle){Console.WriteLine("NOT_FOCUSED");return;}SendKeys.SendWait("^+{F9}");Console.WriteLine("KEYS_SENT");}}));}});thread.IsBackground=true;thread.Start();
 }
 void Line(Graphics g,string text,int x,int y,int size,bool bold=false){float scale=Width/1920f;using(var font=new Font("Segoe UI",size*scale,bold?FontStyle.Bold:FontStyle.Regular,GraphicsUnit.Pixel))using(var brush=new SolidBrush(Color.FromArgb(238,239,234)))g.DrawString(text,font,brush,x*scale,y*(Height/1080f));}
 protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);if(black){e.Graphics.Clear(Color.Black);return;}e.Graphics.TextRenderingHint=System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
 Line(e.Graphics,"ACCEPTED",160,80,24,true);Line(e.Graphics,"Frontier Supply: Cold Chain",650,170,29,true);Line(e.Graphics,"Contracted By Covalex Shipping",650,240,22);Line(e.Graphics,"Reward 60,000 aUEC",650,290,24);
 Line(e.Graphics,"DETAILS",650,380,22,true);Line(e.Graphics,"Collect 9 SCU of Pressurized Ice",650,430,20);Line(e.Graphics,"from Port Tressler.",650,463,20);Line(e.Graphics,"Collect 9 SCU of Processed Food",650,520,20);Line(e.Graphics,"from Port Tressler.",650,553,20);
 Line(e.Graphics,"PRIMARY OBJECTIVES",1300,380,22,true);
 string[] commodities={"Pressurized Ice","Pressurized Ice","Processed Food","Processed Food"},destinations={"Rayari Cantwell Research Outpost","Rayari McGrath Research Outpost","Rayari Cantwell Research Outpost","Rayari McGrath Research Outpost"};int[] quantities={4,5,5,4};
 for(int i=0;i<4;i++){int y=430+i*90;Line(e.Graphics,"Deliver 0/"+quantities[i]+" SCU of "+commodities[i]+" to",1300,y,20);Line(e.Graphics,destinations[i],1300,y+33,20);}
 Line(e.Graphics,"SYNTHETIC OCR TEST - NO REAL GAME SESSION",80,1000,18);
 }
 [STAThread]static void Main(){try{SetProcessDpiAwarenessContext(new IntPtr(-4));}catch{}Application.EnableVisualStyles();Application.Run(new OcrFixture());}
}
