"""本地宠物抠图、圆形膨胀白描边与透明 PNG。stdin/stdout 均为二进制。"""
import io, os, sys, json
from pathlib import Path
from PIL import Image, ImageOps, ImageFilter, UnidentifiedImageError
Image.MAX_IMAGE_PIXELS = 24000000

def sticker(data, session_factory=None):
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
        if image.width * image.height > 24000000 or min(image.size) < 64:
            raise ValueError('INVALID_IMAGE')
        image = ImageOps.exif_transpose(image).convert('RGBA')
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError):
        raise ValueError('INVALID_IMAGE')
    image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
    alpha = image.getchannel('A')
    # Already cut out: preserve the exact supplied alpha rather than segment twice.
    if alpha.getextrema()[0] >= 250:
        model = os.environ.get('STICKER_MODEL', 'u2net')
        if model not in ('u2net', 'u2netp', 'isnet-general-use'):
            raise ValueError('STICKER_UNAVAILABLE')
        model_path = Path(os.environ['U2NET_HOME']) / (model + '.onnx')
        if not model_path.is_file():
            raise ValueError('STICKER_UNAVAILABLE')
        from rembg import remove, new_session
        session = (session_factory or new_session)(model, providers=['CPUExecutionProvider'])
        image = remove(image, session=session).convert('RGBA')
        alpha = image.getchannel('A')
    # Avoid returning an empty image or the unmodified rectangle as a success.
    solid = alpha.point(lambda p: 255 if p >= 100 else 0)
    histogram = solid.histogram()
    coverage = histogram[255] / (image.width * image.height)
    bbox = solid.getbbox()
    if not bbox or coverage < .012 or coverage > .98:
        raise ValueError('NO_SUBJECT')
    # Keep soft fur edges around the confident foreground.
    x0,y0,x1,y1=bbox
    bbox=(max(0,x0-8),max(0,y0-8),min(image.width,x1+8),min(image.height,y1+8))
    pet = image.crop(bbox)
    pet.thumbnail((880,880),Image.Resampling.LANCZOS)
    # Upscale a small pet consistently to the composition's safe bounds.
    scale=min(880/pet.width,880/pet.height)
    pet=pet.resize((max(1,round(pet.width*scale)),max(1,round(pet.height*scale))),Image.Resampling.LANCZOS)
    foreground=Image.new('RGBA',(1024,1024))
    foreground.alpha_composite(pet,((1024-pet.width)//2,(1024-pet.height)//2))
    # Distance transform gives round, even outline instead of square dilation corners.
    import numpy as np
    from scipy.ndimage import distance_transform_edt
    mask=np.asarray(foreground.getchannel('A'))
    distance=distance_transform_edt(mask < 32)
    outline=np.clip((19.5-distance)*255,0,255).astype('uint8')
    border=Image.new('RGBA',(1024,1024),(255,255,255,0))
    border.putalpha(Image.fromarray(outline))
    border.alpha_composite(foreground)
    result=io.BytesIO()
    border.save(result,format='PNG',optimize=True)
    return result.getvalue()

if __name__ == '__main__':
    try:
        data=sys.stdin.buffer.read(10*1024*1024+1)
        if not data or len(data)>10*1024*1024:raise ValueError('INVALID_IMAGE')
        sys.stdout.buffer.write(sticker(data))
    except Exception as exc:
        code=str(exc) if str(exc) in ('INVALID_IMAGE','NO_SUBJECT','STICKER_UNAVAILABLE') else 'STICKER_FAILED'
        print(json.dumps({'code':code}),file=sys.stderr)
        sys.exit(1)
