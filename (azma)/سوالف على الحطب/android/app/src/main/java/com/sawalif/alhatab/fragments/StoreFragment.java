package com.sawalif.alhatab.fragments;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.webkit.JavascriptInterface;
import android.content.SharedPreferences;
import androidx.fragment.app.Fragment;
import com.sawalif.alhatab.R;
import org.json.JSONArray;
import org.json.JSONObject;

public class StoreFragment extends Fragment {

    private WebView webView;
    private OrdersCallback callback;

    public interface OrdersCallback {
        void onOrderAdded();
    }

    public void setOrdersCallback(OrdersCallback cb) { this.callback = cb; }

    @Override
    public View onCreateView(LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState) {
        View v = inflater.inflate(R.layout.fragment_store, container, false);
        webView = v.findViewById(R.id.storeWebView);

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
            public void addOrder(String item, String note) {
                saveOrder(item, note);
                if (callback != null) callback.onOrderAdded();
            }
        }, "AndroidApp");

        webView.loadUrl("file:///android_asset/login.html");
        return v;
    }

    private void saveOrder(String item, String note) {
        try {
            SharedPreferences prefs = requireActivity().getSharedPreferences("orders", 0);
            String json = prefs.getString("list", "[]");
            JSONArray arr = new JSONArray(json);
            JSONObject obj = new JSONObject();
            obj.put("item", item);
            obj.put("note", note);
            obj.put("time", System.currentTimeMillis());
            arr.put(obj);
            prefs.edit().putString("list", arr.toString()).apply();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public boolean canGoBack() {
        return webView != null && webView.canGoBack();
    }

    public void goBack() {
        if (webView != null) webView.goBack();
    }
}
