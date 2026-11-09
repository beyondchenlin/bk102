"""自制透明多行文字测试素材；只写本实验的两个命名PNG。"""
from pathlib import Path
import subprocess
target=Path(__file__).resolve().parents[1]/'app/src/main/assets/fixtures'
for name,lines in [('native-sticker.png',['慢一点','也很好']),('native-sticker-alt.png',['慢一点','再出发'])]:
 filters=[f"drawtext=fontfile='C\\:/Windows/Fonts/msyhbd.ttc':text='{line}':fontsize=64:fontcolor=white:borderw=3:bordercolor=0x202124:x=(w-text_w)/2:y={y}-text_h/2" for y,line in zip([159,241],lines)]
 subprocess.run(['E:/ffmpeg/bin/ffmpeg.exe','-v','error','-y','-f','lavfi','-i','color=c=black@0:s=1080x400,format=rgba','-vf',','.join(filters),'-frames:v','1','-update','1',str(target/name)],check=True)
