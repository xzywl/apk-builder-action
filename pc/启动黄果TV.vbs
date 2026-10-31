' 黄果TV PC 版启动器（零窗口）：隐藏启动本地服务并打开浏览器
' 双击本文件即可使用；服务已在运行则直接打开页面。
Option Explicit
Dim sh, dir, port, probe
Set sh = CreateObject("WScript.Shell")
dir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
port = 8421

' 探测服务是否已在运行（用 PowerShell 隐藏执行，零窗口）
probe = sh.Run("powershell -NoProfile -WindowStyle Hidden -Command ""(New-Object Net.Sockets.TcpClient).Connect('127.0.0.1'," & port & ")"" ", 0, True)

If probe <> 0 Then
    ' 未运行：隐藏启动 node 服务
    sh.CurrentDirectory = dir
    sh.Run "node server.js", 0, False
    WScript.Sleep 1200
End If

sh.Run "http://127.0.0.1:" & port, 1, False
