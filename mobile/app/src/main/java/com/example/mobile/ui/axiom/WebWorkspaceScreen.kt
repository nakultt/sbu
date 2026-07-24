package com.example.mobile.ui.axiom

import android.Manifest
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.example.mobile.BuildConfig

@Composable
fun WebWorkspaceScreen(colors: AxiomColors) {
    val context = LocalContext.current
    var selected by remember { mutableStateOf<WebFeature?>(null) }
    var webView by remember { mutableStateOf<WebView?>(null) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var fileCallback by remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }
    var mediaPermission by remember { mutableStateOf<PermissionRequest?>(null) }

    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val callback = fileCallback
        fileCallback = null
        callback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data))
    }
    val microphonePermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        mediaPermission?.let { request ->
            if (granted) request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) else request.deny()
        }
        mediaPermission = null
    }

    BackHandler(enabled = selected != null) {
        val current = webView
        if (current?.canGoBack() == true) current.goBack() else selected = null
    }

    if (selected == null) {
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 4.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                "Complete workspace",
                style = TextStyle(fontFamily = Sans, fontSize = 22.sp, fontWeight = FontWeight.Medium, color = colors.text),
            )
            Text(
                "Every dashboard feature uses the live web application and its backend connection.",
                style = TextStyle(fontFamily = Sans, fontSize = 12.sp, color = colors.dim),
            )
            webFeatures.forEach { feature ->
                Row(
                    modifier = Modifier.fillMaxWidth().border(1.dp, colors.line).background(colors.panel)
                        .axClick { loadError = null; selected = feature }.padding(14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(feature.label, color = colors.text, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        Text(feature.description, color = colors.dim, fontSize = 11.sp)
                    }
                    Text("›", style = monoLabel(18, colors.accent, 0f))
                }
            }
        }
        return
    }

    val feature = selected ?: return
    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().border(1.dp, colors.line).background(colors.panel).padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("‹ ALL", style = monoLabel(10, colors.accent, 0.12f), modifier = Modifier.axClick { selected = null })
            Text(feature.label, color = colors.text, fontSize = 13.sp, modifier = Modifier.weight(1f))
            Text("RELOAD", style = monoLabel(9, colors.dim, 0.1f), modifier = Modifier.axClick { webView?.reload() })
        }
        loadError?.let { error ->
            Column(
                Modifier.fillMaxWidth().border(1.dp, androidx.compose.ui.graphics.Color(0xFFF87171)).padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(error, color = androidx.compose.ui.graphics.Color(0xFFF87171), fontSize = 12.sp)
                Text("RETRY", style = monoLabel(10, colors.accent, 0.12f), modifier = Modifier.axClick { webView?.reload() })
            }
        }
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { viewContext ->
                WebView(viewContext).apply {
                    webView = this
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.databaseEnabled = true
                    settings.cacheMode = WebSettings.LOAD_DEFAULT
                    settings.mediaPlaybackRequiresUserGesture = true
                    settings.javaScriptCanOpenWindowsAutomatically = true
                    settings.setSupportMultipleWindows(true)
                    settings.allowFileAccess = false
                    settings.allowContentAccess = true
                    CookieManager.getInstance().setAcceptCookie(true)
                    CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
                    webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                            val target = request?.url ?: return false
                            val workspaceHost = Uri.parse(BuildConfig.WEB_BASE_URL).host
                            if (target.host == workspaceHost) return false
                            viewContext.startActivity(Intent(Intent.ACTION_VIEW, target))
                            return true
                        }

                        override fun onPageFinished(view: WebView?, url: String?) {
                            loadError = null
                        }

                        override fun onReceivedError(
                            view: WebView?,
                            request: WebResourceRequest?,
                            error: WebResourceError?,
                        ) {
                            if (request?.isForMainFrame == true) {
                                loadError = "Could not load the live web workspace: ${error?.description ?: "network error"}"
                            }
                        }
                    }
                    webChromeClient = object : WebChromeClient() {
                        override fun onCreateWindow(
                            view: WebView?,
                            isDialog: Boolean,
                            isUserGesture: Boolean,
                            resultMsg: android.os.Message?,
                        ): Boolean {
                            val popup = WebView(viewContext).apply {
                                webViewClient = object : WebViewClient() {
                                    override fun shouldOverrideUrlLoading(
                                        view: WebView?,
                                        request: WebResourceRequest?,
                                    ): Boolean {
                                        request?.url?.let { viewContext.startActivity(Intent(Intent.ACTION_VIEW, it)) }
                                        return true
                                    }
                                }
                            }
                            val transport = resultMsg?.obj as? WebView.WebViewTransport ?: return false
                            transport.webView = popup
                            resultMsg.sendToTarget()
                            return true
                        }

                        override fun onShowFileChooser(
                            webView: WebView?,
                            callback: ValueCallback<Array<Uri>>?,
                            params: FileChooserParams?,
                        ): Boolean {
                            fileCallback?.onReceiveValue(null)
                            fileCallback = callback
                            return runCatching {
                                filePicker.launch(params?.createIntent() ?: Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                                    type = "*/*"
                                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                                    addCategory(Intent.CATEGORY_OPENABLE)
                                })
                                true
                            }.getOrElse {
                                fileCallback = null
                                callback?.onReceiveValue(null)
                                false
                            }
                        }

                        override fun onPermissionRequest(request: PermissionRequest?) {
                            if (request?.resources?.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE) == true) {
                                mediaPermission = request
                                microphonePermission.launch(Manifest.permission.RECORD_AUDIO)
                            } else {
                                request?.deny()
                            }
                        }
                    }
                    setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
                        val filename = URLUtil.guessFileName(url, contentDisposition, mimeType)
                        val download = DownloadManager.Request(Uri.parse(url))
                            .setMimeType(mimeType)
                            .addRequestHeader("User-Agent", userAgent)
                            .addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url).orEmpty())
                            .setTitle(filename)
                            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename)
                        (viewContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(download)
                    }
                    loadUrl("${BuildConfig.WEB_BASE_URL}${feature.route}")
                }
            },
            update = { current ->
                val expected = "${BuildConfig.WEB_BASE_URL}${feature.route}"
                if (current.url == null || current.url == "about:blank") current.loadUrl(expected)
            },
        )
    }

    DisposableEffect(feature) {
        onDispose {
            fileCallback?.onReceiveValue(null)
            fileCallback = null
            mediaPermission?.deny()
            mediaPermission = null
            webView?.stopLoading()
            webView?.destroy()
            webView = null
        }
    }
}
