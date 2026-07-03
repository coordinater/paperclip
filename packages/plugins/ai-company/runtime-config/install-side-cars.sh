#!/usr/bin/env bash
# ai-company 侧车安装脚本 · W2-D6/D7 wire-up
#
# 装 codebase-memory-mcp (W2-D6) + pyrefly (W2-D7) 到本机 PATH
#
# 用法: cd packages/plugins/ai-company/runtime-config && ./install-side-cars.sh
# 要求: macOS 或 Linux · brew 或 apt 已装 · Python 3.9+ 已装
#
# 幂等: 多次跑安全 · 已装则 skip

set -euo pipefail

echo "=== ai-company side-car install script ==="
echo "W2-D6 codebase-memory-mcp + W2-D7 pyrefly wire-up"
echo ""

# ============ W2-D6 codebase-memory-mcp ============
if command -v codebase-memory-mcp >/dev/null 2>&1; then
  INSTALLED_VERSION=$(codebase-memory-mcp --version 2>/dev/null || echo "unknown")
  echo "[skip] codebase-memory-mcp already installed: $INSTALLED_VERSION"
else
  echo "[install] codebase-memory-mcp..."
  # 装配路径参考 https://github.com/DeusData/codebase-memory-mcp README §Install
  # macOS: brew (或直接从 GitHub Release 下 binary)
  # Linux: 直接从 GitHub Release 下 binary
  OS="$(uname -s)"
  case "$OS" in
    Darwin)
      if command -v brew >/dev/null 2>&1 && brew tap DeusData/tap 2>/dev/null; then
        brew install codebase-memory-mcp
      else
        echo "  brew tap 不可用 · fallback 到 GitHub Release 手装"
        echo "  访问 https://github.com/DeusData/codebase-memory-mcp/releases/latest"
        echo "  下 darwin-arm64.tar.gz · 解压到 ~/.local/bin/"
        echo "  或跑: curl -L <release-url> | tar xz -C ~/.local/bin/"
        exit 1
      fi
      ;;
    Linux)
      echo "  Linux: 从 GitHub Release 下 linux-x64.tar.gz · 解压到 ~/.local/bin/"
      echo "  参考 https://github.com/DeusData/codebase-memory-mcp/releases/latest"
      exit 1
      ;;
    *)
      echo "  不支持的 OS: $OS · 参考 README 手装"
      exit 1
      ;;
  esac
fi

# ============ W2-D7 pyrefly ============
if command -v pyrefly >/dev/null 2>&1; then
  INSTALLED_VERSION=$(pyrefly --version 2>/dev/null || echo "unknown")
  echo "[skip] pyrefly already installed: $INSTALLED_VERSION"
else
  echo "[install] pyrefly (Meta Python type checker)..."
  # 参考 https://github.com/facebook/pyrefly
  if command -v pip3 >/dev/null 2>&1; then
    pip3 install --user pyrefly
  elif command -v pip >/dev/null 2>&1; then
    pip install --user pyrefly
  else
    echo "  pip 未装 · 先装 Python 3.9+" >&2
    exit 1
  fi

  # 提示 PATH 确认
  PYREFLY_PATH="$(python3 -c 'import site; print(site.USER_BASE + "/bin")' 2>/dev/null || echo "$HOME/.local/bin")"
  if ! echo "$PATH" | grep -q "$PYREFLY_PATH"; then
    echo "  ⚠️  pyrefly 装到了 $PYREFLY_PATH · 请把这个路径加到 PATH:"
    echo "     export PATH=\"$PYREFLY_PATH:\$PATH\""
    echo "  加到 ~/.zshrc 或 ~/.bashrc 使之持久化"
  fi
fi

echo ""
echo "=== 验证 ==="
echo -n "codebase-memory-mcp: "
codebase-memory-mcp --version 2>/dev/null || echo "❌ 装失败 · 见上面 install 段的手动步骤"
echo -n "pyrefly: "
pyrefly --version 2>/dev/null || echo "❌ 装失败 · 见上面 install 段的 pip 提示"

echo ""
echo "=== 下一步 ==="
echo "1. 起 codebase-memory-mcp: codebase-memory-mcp serve --port 9749 &"
echo "2. 把 workspace-runtime-services.yaml 内容合并到目标 project .paperclip.yaml"
echo "3. 见 claude-code-adapter-env.md 配置 Claude Code MCP config"
echo "4. paperclip UI 起 runtime services 或走 workspace_runtime_services API"
