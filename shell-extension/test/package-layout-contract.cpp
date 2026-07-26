#include <windows.h>
#include <shobjidl_core.h>
#include <wrl/client.h>

#include <cstdio>
#include <string>

using Microsoft::WRL::ComPtr;

static const CLSID CLSID_DesktopMaterialCommand = {
    0x6e2f4c1a,
    0x6e5d,
    0x4d5b,
    {0x9d, 0x3f, 0x3f, 0x0b, 0x2a, 0x7c, 0x9d, 0x41}};

using DllGetClassObjectFn = HRESULT(__stdcall*)(REFCLSID, REFIID, void**);

int wmain(int argc, wchar_t** argv) {
  if (argc != 3) {
    std::fwprintf(stderr, L"usage: layout-contract <dll> <expected-exe>\n");
    return 2;
  }

  const HRESULT initialized = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
  if (FAILED(initialized)) {
    return 3;
  }

  HMODULE module = LoadLibraryW(argv[1]);
  if (module == nullptr) {
    CoUninitialize();
    return 4;
  }

  const auto getClassObject = reinterpret_cast<DllGetClassObjectFn>(
      GetProcAddress(module, "DllGetClassObject"));
  if (getClassObject == nullptr) {
    FreeLibrary(module);
    CoUninitialize();
    return 5;
  }

  ComPtr<IClassFactory> factory;
  HRESULT result = getClassObject(
      CLSID_DesktopMaterialCommand, __uuidof(IClassFactory),
      reinterpret_cast<void**>(factory.GetAddressOf()));
  if (FAILED(result)) {
    FreeLibrary(module);
    CoUninitialize();
    return 6;
  }

  ComPtr<IExplorerCommand> command;
  result = factory->CreateInstance(
      nullptr, __uuidof(IExplorerCommand),
      reinterpret_cast<void**>(command.GetAddressOf()));
  if (FAILED(result)) {
    factory.Reset();
    FreeLibrary(module);
    CoUninitialize();
    return 7;
  }

  EXPCMDSTATE state = ECS_HIDDEN;
  result = command->GetState(nullptr, FALSE, &state);
  if (FAILED(result) || state != ECS_ENABLED) {
    command.Reset();
    factory.Reset();
    FreeLibrary(module);
    CoUninitialize();
    return 8;
  }

  PWSTR icon = nullptr;
  result = command->GetIcon(nullptr, &icon);
  const std::wstring expectedIcon = std::wstring(argv[2]) + L",0";
  const bool iconMatches =
      SUCCEEDED(result) && icon != nullptr &&
      CompareStringOrdinal(icon, -1, expectedIcon.c_str(), -1, TRUE) ==
          CSTR_EQUAL;
  CoTaskMemFree(icon);

  command.Reset();
  factory.Reset();
  FreeLibrary(module);
  CoUninitialize();
  return iconMatches ? 0 : 9;
}
