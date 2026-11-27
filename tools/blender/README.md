# 言喵 3D 猫资产

`build_yanmiao_cat.py` 是可重复执行的 Blender 建模脚本。它使用设计稿角色做正面轮廓校准，但每个可见元素都会生成独立的 Blender 几何体，禁止把整张图片作为模型贴图。

建模脚本现在包含：独立 UV、按材质族生成并嵌入 GLB 的 albedo/微法线贴图，以及 `YNM_CAT_RIG` 骨架。骨骼包括头部、耳朵、四肢、尾巴和躯干；`YNM_IDLE`、`YNM_TOUCH`、`YNM_WAVE` 已作为动画片段写入当前三套 GLB，供 Three.js 的 `AnimationMixer` 播放。

当前多视图校准参考：

- [art/yanmiao-cat-turnaround.png](../../art/yanmiao-cat-turnaround.png)：首页站立态
- [art/yanmiao-cat-touch-turnaround.png](../../art/yanmiao-cat-touch-turnaround.png)：点击反馈态（抬爪、闭眼、吐舌）
- [art/yanmiao-cat-menu-turnaround.png](../../art/yanmiao-cat-menu-turnaround.png)：玩法菜单态（胸像、双爪搭在面板边缘）

这些转面图包含正面、左右 45°、侧面和背面；它们只作为建模辅助，不会被导出到 GLB 或小程序运行时。后两组侧面和背面是基于当前正面设计稿推导的制作参考，最终需要美术验收。

```bash
blender --background --python tools/blender/build_yanmiao_cat.py
```

会生成：

- `art/yanmiao-cat.blend`：可继续编辑和校准的工程文件
- `art/yanmiao-cat-preview.png`：正面相机比对预览
- `art/textures/yanmiao-cat/`：按毛发、粉色、黄色、白色等材质族生成的贴图源
- `miniprogram/assets/models/yanmiao-cat.glb`：供 Three.js 资产管线使用的 GLB

设置形态变量可以生成另外两套独立资产：

```bash
YANMIAO_VARIANT=touch blender --background --python tools/blender/build_yanmiao_cat.py
YANMIAO_VARIANT=menu blender --background --python tools/blender/build_yanmiao_cat.py
```

对应输出为 `art/yanmiao-cat-touch.blend`、`art/yanmiao-cat-menu.blend`，以及 `miniprogram/assets/models/yanmiao-cat-touch.glb`、`miniprogram/assets/models/yanmiao-cat-menu.glb`。正面渲染预览仍以 `art/yanmiao-cat-preview.png` 为当前已生成的比对文件。

这次参考只有一张正面图，因此脚本可以严格校准正面轮廓、配件和比例，但背面不是由原图直接提供的事实；背面几何需要在 Blender 中旋转检查后再做最终美术验收。
