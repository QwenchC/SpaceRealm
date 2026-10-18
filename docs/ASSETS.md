# 外部资源与许可

## NASA / Three.js 行星纹理

以下文件来自 Three.js 官方示例的 `examples/textures/planets` 目录，原始数据为 NASA 的地球与月球观测可视化（NASA 图像通常属于公共领域；在此仅作为原型演示资源使用）：

| 文件 | 来源 URL | 用途 |
| --- | --- | --- |
| `public/textures/earth_atmos.jpg` | https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg | 地球日面反照率 |
| `public/textures/earth_clouds.png` | https://threejs.org/examples/textures/planets/earth_clouds_1024.png | 地球云层 |
| `public/textures/earth_lights.png` | https://threejs.org/examples/textures/planets/earth_lights_2048.png | 地球夜灯 |
| `public/textures/earth_normal_2048.jpg` | https://threejs.org/examples/textures/planets/earth_normal_2048.jpg | 地球法线 |
| `public/textures/earth_specular_2048.jpg` | https://threejs.org/examples/textures/planets/earth_specular_2048.jpg | 海洋高光/粗糙度 |
| `public/textures/moon_1024.jpg` | https://threejs.org/examples/textures/planets/moon_1024.jpg | 月球反照率 |

如果用于商业发行，请依据 NASA 媒体使用指南与 Three.js 示例资产条款再次核对授权。

## 字体

- **Orbitron** — SIL Open Font License 1.1
- **Rajdhani** — SIL Open Font License 1.1

通过 npm 包 `@fontsource/orbitron`、`@fontsource/rajdhani` 打包。

## 程序化内容

其余所有贴图、行星、云层、地形、星舰、生态、特效与 UI 均在客户端运行时程序化生成，不依赖外部模型或运行时网络请求。
