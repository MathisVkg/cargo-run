using System;using System.Drawing;using System.Drawing.Text;using System.Drawing.Imaging;
class OcrRecoveryFixture{
static void Line(Graphics g,string text,int x,int y,int size,bool bold=false){using(var font=new Font("Segoe UI",size*1.666667f,bold?FontStyle.Bold:FontStyle.Regular,GraphicsUnit.Pixel))using(var b=new SolidBrush(Color.FromArgb(238,239,234)))g.DrawString(text,font,b,x*1.666667f,y*1.666667f);}
static void Main(string[] args){using(var bmp=new Bitmap(3200,1800))using(var g=Graphics.FromImage(bmp)){g.Clear(Color.FromArgb(20,24,32));g.TextRenderingHint=TextRenderingHint.AntiAliasGridFit;
Line(g,"ACCEPTED",160,80,24,true);Line(g,"Rookie Rank - Direct Extra Small Cargo Haul",650,170,29,true);Line(g,"Contracted By",650,235,22);Line(g,"Covalex Independent Contractors",650,270,22);Line(g,"Reward 50,250 aUEC",650,315,24);
Line(g,"DETAILS",650,380,22,true);Line(g,"Collect 8 SCU of Corundum",650,430,22);Line(g,"from NB Int. Spaceport.",650,468,22);Line(g,"Transport 8 SCU of Corundum",650,530,22);Line(g,"to Port Tressler above microTech.",650,568,22);
Line(g,"PRIMARY OBJECTIVES",1300,380,22,true);Line(g,"Deliver 0/8 SCU of Corundum to",1300,430,22);Line(g,"Port Tressler above microTech.",1300,468,22);
Line(g,"ABANDON",1400,930,23,true);Line(g,"TRACK",1700,930,23,true);Line(g,"SYNTHETIC OFFLINE OCR RECOVERY TEST",80,1000,18);bmp.Save(args[0],ImageFormat.Png);
}}}
