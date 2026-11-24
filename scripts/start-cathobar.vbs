Option Explicit

Const DEFAULT_WIDTH = 1600
Const DEFAULT_HEIGHT = 280
Const DEFAULT_PORT = 3000

Dim fso, shell, scriptDir, ps1Path, cmd, i, arg, lowerArg
Dim hasWidth, hasHeight, hasPort
hasWidth = False
hasHeight = False
hasPort = False

For i = 0 To WScript.Arguments.Count - 1
  lowerArg = LCase(WScript.Arguments(i))
  If lowerArg = "-width" Then hasWidth = True
  If lowerArg = "-height" Then hasHeight = True
  If lowerArg = "-port" Then hasPort = True
Next

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
ps1Path = fso.BuildPath(scriptDir, "launch-app.ps1")

cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1Path & """"
If Not hasWidth Then cmd = cmd & " -Width " & DEFAULT_WIDTH
If Not hasHeight Then cmd = cmd & " -Height " & DEFAULT_HEIGHT
If Not hasPort Then cmd = cmd & " -Port " & DEFAULT_PORT

For i = 0 To WScript.Arguments.Count - 1
  arg = WScript.Arguments(i)
  If InStr(arg, " ") > 0 Then
    cmd = cmd & " """ & arg & """"
  Else
    cmd = cmd & " " & arg
  End If
Next

shell.Run cmd, 0, False
