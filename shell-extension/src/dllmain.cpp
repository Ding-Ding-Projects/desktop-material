// Desktop Material Explorer shell extension.
//
// A minimal in-process COM server implementing IExplorerCommand so the app's
// verbs appear in the *top-level* Windows 11 context menu rather than under
// "Show more options", where classic `Directory\shell` verbs are hidden.
//
// It is shipped inside a sparse MSIX package: the package declares the COM
// server and the FileExplorerContextMenus extension, while the actual binaries
// stay in the app's normal install directory (the package's external location).
// The app registers the package per user at runtime from the settings toggle.
//
// The extension deliberately does no work of its own. It resolves the clicked
// folder and launches the application with the same `--quick-action` arguments
// the classic verbs use, so both routes exercise one code path and cannot
// drift apart.

#include <windows.h>
#include <shlobj.h>
#include <shobjidl_core.h>
#include <shlwapi.h>
#include <wrl/client.h>
#include <wrl/implements.h>
#include <string>
#include <vector>

using namespace Microsoft::WRL;

// {6E2F4C1A-6E5D-4D5B-9D3F-3F0B2A7C9D41}
// The CLSID is fixed: the manifest and the registration both name it, and
// changing it would orphan an already-registered package.
static const CLSID CLSID_DesktopMaterialCommand = {
    0x6e2f4c1a,
    0x6e5d,
    0x4d5b,
    {0x9d, 0x3f, 0x3f, 0x0b, 0x2a, 0x7c, 0x9d, 0x41}};

static HINSTANCE g_instance = nullptr;
static LONG g_objectCount = 0;

/// The executable to launch, resolved next to this DLL.
///
/// The extension is always deployed beside the application it launches, so the
/// path is derived rather than read from the registry: there is no configurable
/// value an attacker could repoint at another binary.
static std::wstring GetApplicationPath() {
  wchar_t modulePath[MAX_PATH] = {};
  if (GetModuleFileNameW(g_instance, modulePath, MAX_PATH) == 0) {
    return L"";
  }
  if (!PathRemoveFileSpecW(modulePath)) {
    return L"";
  }

  std::wstring candidate(modulePath);
  candidate += L"\\GitHubDesktop.exe";

  if (GetFileAttributesW(candidate.c_str()) == INVALID_FILE_ATTRIBUTES) {
    return L"";
  }
  return candidate;
}

/// Quote one argument for a Windows command line.
///
/// Every argument is a filesystem path or a fixed literal. A double quote is
/// not a legal path character, so its presence means the value is not what we
/// think it is and the launch is refused rather than escaped.
static bool QuoteArgument(const std::wstring& value, std::wstring& out) {
  if (value.find(L'"') != std::wstring::npos) {
    return false;
  }
  for (wchar_t ch : value) {
    if (ch < 0x20 || ch == 0x7f) {
      return false;
    }
  }
  out = L"\"" + value + L"\"";
  return true;
}

/// Launch the application for a verb against a folder.
static HRESULT LaunchQuickAction(const std::wstring& verb,
                                 const std::wstring& folder) {
  const std::wstring applicationPath = GetApplicationPath();
  if (applicationPath.empty()) {
    return E_FAIL;
  }

  std::wstring quotedApplication;
  std::wstring quotedVerb;
  std::wstring quotedFolder;
  if (!QuoteArgument(applicationPath, quotedApplication) ||
      !QuoteArgument(L"--quick-action=" + verb, quotedVerb) ||
      !QuoteArgument(L"--path=" + folder, quotedFolder)) {
    return E_INVALIDARG;
  }

  std::wstring commandLine =
      quotedApplication + L" " + quotedVerb + L" " + quotedFolder;

  STARTUPINFOW startupInfo = {};
  startupInfo.cb = sizeof(startupInfo);
  PROCESS_INFORMATION processInfo = {};

  // CreateProcess mutates the command-line buffer, so it must be writable.
  std::vector<wchar_t> mutableCommandLine(commandLine.begin(),
                                          commandLine.end());
  mutableCommandLine.push_back(L'\0');

  // The application path is passed explicitly so no PATH search can select a
  // different binary.
  if (!CreateProcessW(applicationPath.c_str(), mutableCommandLine.data(),
                      nullptr, nullptr, FALSE, 0, nullptr, folder.c_str(),
                      &startupInfo, &processInfo)) {
    return HRESULT_FROM_WIN32(GetLastError());
  }

  CloseHandle(processInfo.hThread);
  CloseHandle(processInfo.hProcess);
  return S_OK;
}

/// Read the single folder a context-menu invocation targets.
static HRESULT GetTargetFolder(IShellItemArray* items, std::wstring& folder) {
  if (items == nullptr) {
    return E_INVALIDARG;
  }

  DWORD count = 0;
  HRESULT hr = items->GetCount(&count);
  if (FAILED(hr) || count == 0) {
    return E_INVALIDARG;
  }

  ComPtr<IShellItem> item;
  hr = items->GetItemAt(0, &item);
  if (FAILED(hr)) {
    return hr;
  }

  PWSTR path = nullptr;
  hr = item->GetDisplayName(SIGDN_FILESYSPATH, &path);
  if (FAILED(hr)) {
    return hr;
  }

  folder.assign(path);
  CoTaskMemFree(path);
  return S_OK;
}

/// One leaf entry in the Desktop Material flyout.
class SubCommand
    : public RuntimeClass<RuntimeClassFlags<ClassicCom>, IExplorerCommand> {
 public:
  SubCommand(std::wstring title, std::wstring verb)
      : title_(std::move(title)), verb_(std::move(verb)) {
    InterlockedIncrement(&g_objectCount);
  }
  ~SubCommand() { InterlockedDecrement(&g_objectCount); }

  IFACEMETHODIMP GetTitle(IShellItemArray*, PWSTR* name) override {
    return SHStrDupW(title_.c_str(), name);
  }
  IFACEMETHODIMP GetIcon(IShellItemArray*, PWSTR* icon) override {
    const std::wstring applicationPath = GetApplicationPath();
    if (applicationPath.empty()) {
      *icon = nullptr;
      return E_NOTIMPL;
    }
    return SHStrDupW((applicationPath + L",0").c_str(), icon);
  }
  IFACEMETHODIMP GetToolTip(IShellItemArray*, PWSTR* tip) override {
    *tip = nullptr;
    return E_NOTIMPL;
  }
  IFACEMETHODIMP GetCanonicalName(GUID* guid) override {
    *guid = GUID_NULL;
    return S_OK;
  }
  IFACEMETHODIMP GetState(IShellItemArray*, BOOL, EXPCMDSTATE* state) override {
    *state = ECS_ENABLED;
    return S_OK;
  }
  IFACEMETHODIMP GetFlags(EXPCMDFLAGS* flags) override {
    *flags = ECF_DEFAULT;
    return S_OK;
  }
  IFACEMETHODIMP EnumSubCommands(IEnumExplorerCommand** enumerator) override {
    *enumerator = nullptr;
    return E_NOTIMPL;
  }
  IFACEMETHODIMP Invoke(IShellItemArray* items, IBindCtx*) noexcept override {
    std::wstring folder;
    HRESULT hr = GetTargetFolder(items, folder);
    if (FAILED(hr)) {
      return hr;
    }
    return LaunchQuickAction(verb_, folder);
  }

 private:
  std::wstring title_;
  std::wstring verb_;
};

/// Enumerator over the flyout's leaf entries.
class SubCommandEnum
    : public RuntimeClass<RuntimeClassFlags<ClassicCom>, IEnumExplorerCommand> {
 public:
  SubCommandEnum() { InterlockedIncrement(&g_objectCount); }
  ~SubCommandEnum() { InterlockedDecrement(&g_objectCount); }

  IFACEMETHODIMP Next(ULONG celt, IExplorerCommand** commands,
                      ULONG* fetched) override {
    ULONG produced = 0;
    for (ULONG i = 0; i < celt && index_ < kCommandCount; ++i, ++index_) {
      ComPtr<IExplorerCommand> command;
      switch (index_) {
        case 0:
          command = Make<SubCommand>(L"Commit && push here",
                                     L"status-commit-push");
          break;
        default:
          command =
              Make<SubCommand>(L"Open in Desktop Material", L"open-in-full-app");
          break;
      }
      if (command == nullptr) {
        return E_OUTOFMEMORY;
      }
      commands[produced] = command.Detach();
      ++produced;
    }
    if (fetched != nullptr) {
      *fetched = produced;
    }
    return produced == celt ? S_OK : S_FALSE;
  }

  IFACEMETHODIMP Skip(ULONG celt) override {
    index_ += celt;
    return S_OK;
  }
  IFACEMETHODIMP Reset() override {
    index_ = 0;
    return S_OK;
  }
  IFACEMETHODIMP Clone(IEnumExplorerCommand** out) override {
    *out = nullptr;
    return E_NOTIMPL;
  }

 private:
  static constexpr ULONG kCommandCount = 2;
  ULONG index_ = 0;
};

/// The flyout root Explorer shows in the top-level menu.
class RootCommand
    : public RuntimeClass<RuntimeClassFlags<ClassicCom>, IExplorerCommand> {
 public:
  RootCommand() { InterlockedIncrement(&g_objectCount); }
  ~RootCommand() { InterlockedDecrement(&g_objectCount); }

  IFACEMETHODIMP GetTitle(IShellItemArray*, PWSTR* name) override {
    return SHStrDupW(L"Desktop Material", name);
  }
  IFACEMETHODIMP GetIcon(IShellItemArray*, PWSTR* icon) override {
    const std::wstring applicationPath = GetApplicationPath();
    if (applicationPath.empty()) {
      *icon = nullptr;
      return E_NOTIMPL;
    }
    return SHStrDupW((applicationPath + L",0").c_str(), icon);
  }
  IFACEMETHODIMP GetToolTip(IShellItemArray*, PWSTR* tip) override {
    *tip = nullptr;
    return E_NOTIMPL;
  }
  IFACEMETHODIMP GetCanonicalName(GUID* guid) override {
    *guid = GUID_NULL;
    return S_OK;
  }
  IFACEMETHODIMP GetState(IShellItemArray*, BOOL, EXPCMDSTATE* state) override {
    // Hidden entirely when the application is not beside this DLL, rather than
    // shown as an entry that would fail on click.
    *state = GetApplicationPath().empty() ? ECS_HIDDEN : ECS_ENABLED;
    return S_OK;
  }
  IFACEMETHODIMP GetFlags(EXPCMDFLAGS* flags) override {
    *flags = ECF_HASSUBCOMMANDS;
    return S_OK;
  }
  IFACEMETHODIMP EnumSubCommands(IEnumExplorerCommand** enumerator) override {
    auto instance = Make<SubCommandEnum>();
    if (instance == nullptr) {
      return E_OUTOFMEMORY;
    }
    return instance.CopyTo(enumerator);
  }
  IFACEMETHODIMP Invoke(IShellItemArray*, IBindCtx*) noexcept override {
    // A flyout root is never invoked directly.
    return S_OK;
  }
};

class ClassFactory : public RuntimeClass<RuntimeClassFlags<ClassicCom>,
                                         IClassFactory> {
 public:
  ClassFactory() { InterlockedIncrement(&g_objectCount); }
  ~ClassFactory() { InterlockedDecrement(&g_objectCount); }

  IFACEMETHODIMP CreateInstance(IUnknown* outer, REFIID riid,
                                void** object) override {
    if (outer != nullptr) {
      return CLASS_E_NOAGGREGATION;
    }
    auto command = Make<RootCommand>();
    if (command == nullptr) {
      return E_OUTOFMEMORY;
    }
    return command->QueryInterface(riid, object);
  }

  IFACEMETHODIMP LockServer(BOOL lock) override {
    if (lock) {
      InterlockedIncrement(&g_objectCount);
    } else {
      InterlockedDecrement(&g_objectCount);
    }
    return S_OK;
  }
};

extern "C" BOOL WINAPI DllMain(HINSTANCE instance, DWORD reason, LPVOID) {
  if (reason == DLL_PROCESS_ATTACH) {
    g_instance = instance;
    DisableThreadLibraryCalls(instance);
  }
  return TRUE;
}

extern "C" HRESULT __stdcall DllGetClassObject(REFCLSID clsid, REFIID riid,
                                               void** object) {
  if (!IsEqualCLSID(clsid, CLSID_DesktopMaterialCommand)) {
    return CLASS_E_CLASSNOTAVAILABLE;
  }
  auto factory = Make<ClassFactory>();
  if (factory == nullptr) {
    return E_OUTOFMEMORY;
  }
  return factory->QueryInterface(riid, object);
}

extern "C" HRESULT __stdcall DllCanUnloadNow() {
  return g_objectCount == 0 ? S_OK : S_FALSE;
}
