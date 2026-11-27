"""安装阶段下载并验证模型；不在图片处理请求中下载。"""
import os
from pathlib import Path
os.environ.setdefault('U2NET_HOME', str(Path(__file__).resolve().parents[1] / '.models'))
os.environ.setdefault('OMP_NUM_THREADS', '2')
from rembg import new_session
model = os.environ.get('STICKER_MODEL', 'u2net')
if model not in ('u2net', 'u2netp', 'isnet-general-use'):
    raise SystemExit('不支持的 STICKER_MODEL')
new_session(model, providers=['CPUExecutionProvider'])
print('抠图模型已就绪：' + model)
