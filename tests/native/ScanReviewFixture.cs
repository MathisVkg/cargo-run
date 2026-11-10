using System;using System.IO;using System.Drawing;using System.Drawing.Text;using System.Drawing.Imaging;
class ScanReviewFixture {
 static void Main(string[] args) { using(var bmp=new Bitmap(3200,1800)) using(var g=Graphics.FromImage(bmp)) {
 g.Clear(Color.FromArgb(24,30,36));g.TextRenderingHint=TextRenderingHint.AntiAliasGridFit;
 foreach(var line in File.ReadAllLines(args[1])) {var p=line.Split('\t');if(p.Length!=4)continue;
 using(var f=new Font("Segoe UI",Math.Max(18,float.Parse(p[3],System.Globalization.CultureInfo.InvariantCulture)*0.85f),GraphicsUnit.Pixel))
 using(var b=new SolidBrush(Color.FromArgb(240,242,235)))g.DrawString(p[0],f,b,float.Parse(p[1],System.Globalization.CultureInfo.InvariantCulture),float.Parse(p[2],System.Globalization.CultureInfo.InvariantCulture));
 } bmp.Save(args[0],ImageFormat.Png);
 }}
}
