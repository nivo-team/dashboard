#!/usr/bin/env node
/**
 * Android 平台构建脚本：为 Nivo Admin 桌面壳打包 Android 原生共享库与 APK 安装包。
 *
 * 核心逻辑：
 *   1. 环境检测（Go / Wails v3 CLI / JDK / Android SDK / NDK），缺失时给出完整指引；
 *   2. 生成 Android overlay (注册 JNI 入口)；
 *   3. 注入前端远程地址（DESKTOP_URL / --url，超薄壳架构支持）；
 *   4. 编译 Go C-shared 库（libwails.so）到 jniLibs；
 *   5. 调用 Gradle wrapper 组装 APK 并输出至 dist/ 目录。
 *
 * 用法：
 *   pnpm desktop:android:build                     # 默认编译 Debug APK (arm64)
 *   DESKTOP_URL=https://admin.example.com pnpm desktop:android:build --release
 *   pnpm desktop:android:build --arch=x86_64       # 针对模拟器架构
 *   pnpm desktop:android:build --check-env         # 仅检测 Android 开发环境
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const appDir = path.resolve(scriptDir, '..')
const androidDir = path.join(appDir, 'build', 'android')
const distDir = path.join(appDir, 'dist')

// Gradle 依赖与构建缓存目录（优先使用环境或外置盘 /Volumes/Kidd/Caches/gradle）
const defaultGradleCacheDir = '/Volumes/Kidd/Caches/gradle'
const gradleUserHome = process.env.GRADLE_USER_HOME || defaultGradleCacheDir
if (!fs.existsSync(gradleUserHome)) {
  try {
    fs.mkdirSync(gradleUserHome, { recursive: true })
  } catch {}
}
process.env.GRADLE_USER_HOME = gradleUserHome

const LDVAR = 'github.com/nivo-team/dashboard/apps/desktop/internal/shell.DefaultURL'

// 命令行参数解析
const args = process.argv.slice(2)
const isRelease = args.includes('--release')
const isCheckEnvOnly = args.includes('--check-env')

let targetArch = 'arm64'
const archArg = args.find((a) => a.startsWith('--arch='))
if (archArg) {
  targetArch = archArg.split('=')[1]
} else if (process.env.ARCH) {
  targetArch = process.env.ARCH
}

let desktopUrl = process.env.DESKTOP_URL ?? ''
const urlArg = args.find((a) => a.startsWith('--url='))
if (urlArg) {
  desktopUrl = urlArg.split('=')[1]
}

function runCommand(cmd, cmdArgs, options = {}) {
  const result = spawnSync(cmd, cmdArgs, {
    cwd: options.cwd || appDir,
    stdio: options.silent ? 'pipe' : 'inherit',
    env: { ...process.env, ...options.env },
  })
  if (result.error) {
    throw result.error
  }
  return result
}

function findCommand(name) {
  const check = spawnSync('which', [name], { encoding: 'utf-8' })
  if (check.status === 0 && check.stdout.trim()) {
    return check.stdout.trim()
  }
  return null
}

function checkEnvironment() {
  console.log('[desktop:android] 正在检测 Android 构建环境依赖...\n')
  const issues = []

  // 1. 检查 Go
  const goPath = findCommand('go')
  if (!goPath) {
    issues.push('Go 未安装或不在 PATH 中（需要 Go 1.24+）')
  } else {
    const versionOutput = spawnSync('go', ['version'], { encoding: 'utf-8' }).stdout.trim()
    console.log(`✓ Go: ${versionOutput}`)
  }

  // 2. 检查 Wails v3 CLI
  let wailsPath = findCommand('wails3')
  if (!wailsPath) {
    const homeGoWails = path.join(process.env.HOME || '', 'go', 'bin', 'wails3')
    if (fs.existsSync(homeGoWails)) {
      wailsPath = homeGoWails
    }
  }
  if (!wailsPath) {
    issues.push('Wails v3 CLI 未找到。请执行: go install github.com/wailsapp/wails/v3/cmd/wails3@latest')
  } else {
    console.log(`✓ Wails3 CLI: ${wailsPath}`)
  }

  // 3. 检查 Java / JDK
  let javaPath = findCommand('java')
  let javaOk = false
  if (javaPath) {
    const checkJava = spawnSync('java', ['-version'], { encoding: 'utf-8' })
    if (checkJava.status === 0 || (checkJava.stderr && !checkJava.stderr.includes('Unable to locate'))) {
      javaOk = true
      console.log(`✓ Java: ${javaPath}`)
    }
  }
  if (!javaOk) {
    const brewJdkPaths = [
      '/opt/homebrew/opt/openjdk@21/bin/java',
      '/opt/homebrew/opt/openjdk/bin/java',
      '/usr/local/opt/openjdk@21/bin/java',
    ]
    for (const p of brewJdkPaths) {
      if (fs.existsSync(p)) {
        javaOk = true
        javaPath = p
        process.env.PATH = `${path.dirname(p)}:${process.env.PATH}`
        console.log(`✓ Java (Homebrew): ${p}`)
        break
      }
    }
  }
  if (!javaOk) {
    issues.push('未检测到有效的 Java Runtime (JDK 17/21)。建议执行: brew install openjdk@21')
  }

  // 4. 检查 Android SDK
  let androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
  if (!androidHome) {
    const defaultPaths = [
      path.join(process.env.HOME || '', 'Library', 'Android', 'sdk'),
      '/opt/homebrew/share/android-commandlinetools',
      path.join(process.env.HOME || '', 'Android', 'Sdk'),
      '/usr/local/share/android-sdk',
    ]
    for (const p of defaultPaths) {
      if (fs.existsSync(p)) {
        androidHome = p
        break
      }
    }
  }
  if (!androidHome || !fs.existsSync(androidHome)) {
    issues.push(
      '未检测到 Android SDK。可通过 Homebrew 安装: brew install --cask android-commandlinetools'
    )
  } else {
    console.log(`✓ ANDROID_HOME: ${androidHome}`)
  }

  // 5. 检查 Android NDK
  let ndkHome = process.env.ANDROID_NDK_HOME
  if (!ndkHome) {
    const candidateNdkPaths = [
      '/opt/homebrew/share/android-ndk',
      '/usr/local/share/android-ndk',
    ]
    for (const p of candidateNdkPaths) {
      if (fs.existsSync(p)) {
        ndkHome = p
        break
      }
    }
  }
  if (!ndkHome && androidHome) {
    const ndkDir = path.join(androidHome, 'ndk')
    if (fs.existsSync(ndkDir)) {
      try {
        const entries = fs.readdirSync(ndkDir).sort().reverse()
        if (entries.length > 0) {
          ndkHome = path.join(ndkDir, entries[0])
        }
      } catch {}
    }
  }
  if (!ndkHome || !fs.existsSync(ndkHome)) {
    issues.push(
      '未检测到 Android NDK。可通过 Homebrew 安装: brew install --cask android-ndk (或由 sdkmanager 安装)'
    )
  } else {
    console.log(`✓ ANDROID_NDK_HOME: ${ndkHome}`)
  }

  // 6. 检查 Gradle 依赖缓存目录
  console.log(`✓ GRADLE_USER_HOME: ${gradleUserHome}`)

  return {
    ready: issues.length === 0,
    issues,
    paths: {
      go: goPath,
      wails: wailsPath,
      androidHome,
      ndkHome,
    },
  }
}

async function main() {
  const env = checkEnvironment()

  if (isCheckEnvOnly) {
    if (env.ready) {
      console.log('\n🎉 Android 构建环境一切就绪！')
      process.exit(0)
    } else {
      console.error('\n❌ 环境缺失项：')
      for (const item of env.issues) {
        console.error(`  - ${item}`)
      }
      process.exit(1)
    }
  }

  if (!env.ready) {
    console.error('\n⚠️ 当前环境缺少 Android 构建依赖，无法完整执行 APK 打包：')
    for (const item of env.issues) {
      console.error(`  • ${item}`)
    }
    console.error('\n快速配置指引（推荐使用 Homebrew 纯命令行，无需 Android Studio）：')
    console.error('  1. 安装 JDK 与 Android 工具包:')
    console.error('     brew install openjdk@21')
    console.error('     brew install --cask android-commandlinetools android-platform-tools android-ndk')
    console.error('  2. 配置环境变量 (写入 ~/.zshrc):')
    console.error('     export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"')
    console.error('     export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"')
    console.error('     export ANDROID_NDK_HOME="/opt/homebrew/share/android-ndk"')
    console.error('     export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"')
    console.error('  3. 同意协议并下载 SDK 核心组件:')
    console.error('     yes | sdkmanager --licenses')
    console.error('     sdkmanager "platforms;android-35" "build-tools;35.0.0"')
    process.exit(1)
  }

  console.log('\n[1/4] 生成 Android 构建 Overlay...')
  const wailsCmd = env.paths.wails || 'wails3'
  runCommand(wailsCmd, ['android', 'overlay:gen', '-out', 'build/android/overlay.json'])

  // 注入超薄壳启动地址
  if (desktopUrl) {
    console.log(`[2/4] 配置应用加载地址: ${desktopUrl}`)
    const stringsXmlPath = path.join(androidDir, 'app', 'src', 'main', 'res', 'values', 'strings.xml')
    if (fs.existsSync(stringsXmlPath)) {
      let content = fs.readFileSync(stringsXmlPath, 'utf-8')
      content = content.replace(
        /<string name="start_url">.*?<\/string>/,
        `<string name="start_url">${desktopUrl}<\/string>`
      )
      fs.writeFileSync(stringsXmlPath, content, 'utf-8')
    }
  } else {
    console.log('[2/4] 未指定 DESKTOP_URL，使用默认加载行为')
  }

  // 确定 NDK clang 交叉编译器
  const ndk = env.paths.ndkHome
  const hostTag = process.platform === 'darwin' ? 'darwin-x86_64' : 'linux-x86_64'
  const toolchain = path.join(ndk, 'toolchains', 'llvm', 'prebuilt', hostTag, 'bin')

  let ccCompiler = ''
  let cxxCompiler = ''
  let goArch = 'arm64'
  let jniDir = 'arm64-v8a'

  if (targetArch === 'amd64' || targetArch === 'x86_64') {
    ccCompiler = path.join(toolchain, 'x86_64-linux-android21-clang')
    cxxCompiler = path.join(toolchain, 'x86_64-linux-android21-clang++')
    goArch = 'amd64'
    jniDir = 'x86_64'
  } else {
    ccCompiler = path.join(toolchain, 'aarch64-linux-android21-clang')
    cxxCompiler = path.join(toolchain, 'aarch64-linux-android21-clang++')
    goArch = 'arm64'
    jniDir = 'arm64-v8a'
  }

  console.log(`[3/4] 编译 Go C-shared 库 (libwails.so -> ${jniDir})...`)
  const jniOutDir = path.join(androidDir, 'app', 'src', 'main', 'jniLibs', jniDir)
  fs.mkdirSync(jniOutDir, { recursive: true })

  const appVersion = (process.env.APP_VERSION ?? '0.0.1-alpha').trim()
  const goTags = isRelease ? 'android,production,release' : 'android,debug'
  const versionFlag = `-X main.version=${appVersion}`
  const ldflags = isRelease && desktopUrl
    ? `-w -s -X ${LDVAR}=${desktopUrl} ${versionFlag}`
    : desktopUrl
      ? `-X ${LDVAR}=${desktopUrl} ${versionFlag}`
      : versionFlag

  const goArgs = [
    'build',
    '-buildmode=c-shared',
    '-overlay',
    'build/android/overlay.json',
    `-tags=${goTags}`,
  ]
  if (ldflags) {
    goArgs.push(`-ldflags=${ldflags}`)
  }
  goArgs.push('-o', path.join(jniOutDir, 'libwails.so'), '.')

  runCommand('go', goArgs, {
    env: {
      CGO_ENABLED: '1',
      GOOS: 'android',
      GOARCH: goArch,
      CC: ccCompiler,
      CXX: cxxCompiler,
    },
  })

  console.log('[4/4] 使用 Gradle 组装 APK...')
  console.log(`📦 Gradle 依赖缓存目录: ${gradleUserHome}`)

  // 写入 local.properties 供 Gradle 插件识别 SDK / NDK 路径
  const localPropsPath = path.join(androidDir, 'local.properties')
  const localPropsContent = [
    `sdk.dir=${env.paths.androidHome}`,
    `ndk.dir=${env.paths.ndkHome}`,
  ].join('\n') + '\n'
  fs.writeFileSync(localPropsPath, localPropsContent, 'utf-8')

  const gradlew = path.join(androidDir, 'gradlew')
  fs.chmodSync(gradlew, '755')

  const javaHome = process.env.JAVA_HOME || '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home'
  const gradleTask = isRelease ? 'assembleRelease' : 'assembleDebug'
  runCommand(gradlew, ['--gradle-user-home', gradleUserHome, gradleTask], {
    cwd: androidDir,
    env: {
      ANDROID_HOME: env.paths.androidHome,
      ANDROID_SDK_ROOT: env.paths.androidHome,
      ANDROID_NDK_HOME: env.paths.ndkHome,
      JAVA_HOME: javaHome,
      GRADLE_USER_HOME: gradleUserHome,
    },
  })

  fs.mkdirSync(distDir, { recursive: true })
  const apkSourceSubpath = isRelease ? 'release/app-release.apk' : 'debug/app-debug.apk'
  const apkSource = path.join(androidDir, 'app', 'build', 'outputs', 'apk', apkSourceSubpath)
  const apkTarget = path.join(distDir, 'nivo-admin.apk')

  if (fs.existsSync(apkSource)) {
    fs.copyFileSync(apkSource, apkTarget)
    const stat = fs.statSync(apkTarget)
    const sizeMb = (stat.size / 1024 / 1024).toFixed(2)
    console.log(`\n✅ Android APK 打包成功！`)
    console.log(`📦 产物路径: ${apkTarget} (${sizeMb} MB)`)
  } else {
    console.warn(`\n⚠️ 未在预期位置找到输出 APK: ${apkSource}`)
  }
}

main().catch((err) => {
  console.error('[desktop:android] 构建出错:', err)
  process.exit(1)
})
