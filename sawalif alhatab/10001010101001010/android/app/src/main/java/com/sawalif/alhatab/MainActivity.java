package com.sawalif.alhatab;

import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.view.View;
import android.webkit.JavascriptInterface;
import androidx.appcompat.app.AppCompatActivity;
import androidx.drawerlayout.widget.DrawerLayout;
import com.google.android.material.navigation.NavigationView;
import androidx.appcompat.widget.Toolbar;
import android.view.MenuItem;
import com.sawalif.alhatab.UpdateHelper;

public class MainActivity extends AppCompatActivity {

    private DrawerLayout drawerLayout;
    private WebView webView;
    private NavigationView navigationView;
    private Toolbar toolbar;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        drawerLayout = findViewById(R.id.drawer_layout);
        navigationView = findViewById(R.id.nav_view);
        toolbar = findViewById(R.id.toolbar);
        webView = findViewById(R.id.webView);

        setSupportActionBar(toolbar);
        getSupportActionBar().setDisplayHomeAsUpEnabled(true);
        getSupportActionBar().setHomeAsUpIndicator(R.drawable.ic_menu);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setAllowFileAccess(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                view.loadUrl(url);
                return true;
            }
        });

        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void closeDrawer() {
                runOnUiThread(() -> drawerLayout.closeDrawers());
            }
        }, "Android");

        toolbar.setNavigationOnClickListener(v -> {
            if (drawerLayout.isDrawerOpen(navigationView))
                drawerLayout.closeDrawer(navigationView);
            else
                drawerLayout.openDrawer(navigationView);
        });

        navigationView.setNavigationItemSelectedListener(item -> {
            int id = item.getItemId();
            if (id == R.id.nav_home) {
                webView.post(() -> webView.loadUrl("javascript:navigateTo('home')"));
            } else if (id == R.id.nav_orders) {
                webView.post(() -> webView.loadUrl("javascript:navigateTo('orders')"));
            } else if (id == R.id.nav_delivery) {
                webView.post(() -> webView.loadUrl("javascript:navigateTo('delivery')"));
            } else if (id == R.id.nav_location) {
                webView.post(() -> webView.loadUrl("javascript:navigateTo('location')"));
            } else if (id == R.id.nav_contact) {
                webView.post(() -> webView.loadUrl("javascript:navigateTo('contact')"));
            }
            drawerLayout.closeDrawers();
            return true;
        });

        webView.loadUrl("file:///android_asset/login.html");

        new UpdateHelper(this).checkForUpdateAuto();
    }

    @Override
    public void onBackPressed() {
        if (drawerLayout.isDrawerOpen(navigationView))
            drawerLayout.closeDrawers();
        else if (webView.canGoBack())
            webView.goBack();
        else
            super.onBackPressed();
    }
}
