#Requires AutoHotkey v2.0
#SingleInstance Force

; QAero Quick Note Popup
; Ctrl+Alt+Q → abre o focaliza la ventana de nota rápida
; Cambia APP_URL si la app corre en otro puerto o dominio

APP_URL := "http://localhost:3000/quick-note-popup"
WIN_TITLE := "quick-note-popup"
WIN_W := 420
WIN_H := 280

; Detecta resolución para posicionar en esquina inferior derecha
SCREEN_W := A_ScreenWidth
SCREEN_H := A_ScreenHeight
WIN_X := SCREEN_W - WIN_W - 20
WIN_Y := SCREEN_H - WIN_H - 60

^!q:: {
    ; Si ya existe la ventana, traerla al frente
    if WinExist(WIN_TITLE " ahk_exe chrome.exe") {
        WinActivate
        return
    }

    ; Abrir nueva ventana popup de Chrome
    chrome := "C:\Program Files\Google\Chrome\Application\chrome.exe"
    if !FileExist(chrome)
        chrome := "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

    Run Format('"{}" --app={} --window-size={},{} --window-position={},{}',
        chrome, APP_URL, WIN_W, WIN_H, WIN_X, WIN_Y)
}
