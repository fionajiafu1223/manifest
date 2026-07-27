# Manifest App 打包上线步骤

这个项目已经用 Capacitor 搭建好了 iOS 和 Android 的原生工程框架，
里面装着你所有网页做的功能（人生剧本、感恩日记、微信/邮箱/短信模拟、愿景板、潜意识音频）。

App图标和启动画面已经自动生成好，两边平台都有。

---

## 第一步：解压这个项目

把 `manifest-capacitor-project.zip` 解压到你电脑上任意一个位置。

## 第二步：新建一个GitHub仓库存放这个项目

**注意：这个不要和你原来的 `fionajiafu1223.github.io` 混在一起**，
那个仓库是纯网页版，这个是打包用的完整App工程，建议单独建一个新仓库，比如叫 `manifest-app`。

1. 打开 GitHub，点右上角 "+" → "New repository"
2. 仓库名填 `manifest-app`（或你喜欢的名字）
3. 设为 Private（私有，不想让别人看到源代码的话）
4. 创建好后，把解压出来的 `manifest-app` 文件夹里所有内容上传上去
   （用网页版 "Add file → Upload files" 拖进去就行，`node_modules` 文件夹不用传，本来也没有）

## 第三步：注册/登录 Codemagic

打开 https://codemagic.io ，用你的 GitHub 账号登录（最简单）。

## 第四步：连接你的仓库

1. Codemagic 首页点 "Add application"
2. 选择 GitHub，授权后选中你刚建的 `manifest-app` 仓库
3. 项目类型选 "Capacitor"（如果自动识别失败，手动选这个）
4. Codemagic 会自动读取项目里的 `codemagic.yaml` 配置文件

## 第五步：配置iOS签名（这一步最关键，需要你的Apple开发者账号信息）

1. 进入这个项目在Codemagic里的设置页
2. 找到 "Team integrations" → "App Store Connect"
3. 需要你去 https://appstoreconnect.apple.com 生成一个 **API Key**：
   - 登录后进入 "用户和访问" → "密钥"
   - 生成一个新Key，下载 `.p8` 密钥文件（只能下载一次，存好）
   - 记下 Key ID 和 Issuer ID
4. 把这三样信息（.p8文件、Key ID、Issuer ID）填入 Codemagic 的 App Store Connect 集成页面
5. 集成的名字要填 `manifest_asc_key`（要和 `codemagic.yaml` 里写的一致，不然连不上）

## 第六步：开始构建

1. 回到项目页面，选择 `ios-workflow`
2. 点 "Start new build"
3. 第一次构建大概需要10-20分钟，Codemagic 会自动：
   - 安装依赖
   - 处理签名
   - 打包成 .ipa 文件
   - **自动上传到 TestFlight**（因为配置里设了 `submit_to_testflight: true`）
4. 构建成功后，去 TestFlight App（或苹果开发者后台）就能看到这个版本了，
   可以直接在自己的 iPhone 上用 TestFlight 安装

## 如果想同时打包Android

选择 `android-workflow` 构建即可，会生成 `.apk` 文件（可以直接下载装到安卓手机上），
不需要审核，不需要上架，构建完了在 Codemagic 的构建结果页面直接下载 apk 文件传到手机安装。

---

## 之后要更新App内容怎么办？

以后如果改了网页里的内容（比如调整了某个页面的功能），
需要把新的 html 文件复制替换到 `www/` 文件夹里，
然后在项目根目录运行一次：

```
npx cap sync
```

再把改动推送（push）到 GitHub 仓库，Codemagic 会自动检测变化重新构建
（如果开启了自动构建的话，也可以每次手动点 "Start new build"）。

---

## 遇到问题怎么办？

Codemagic 构建失败时，点进具体那次构建记录，能看到详细的报错日志（红色文字部分），
把报错内容截图或复制发给我，我可以帮你分析具体卡在哪一步。
