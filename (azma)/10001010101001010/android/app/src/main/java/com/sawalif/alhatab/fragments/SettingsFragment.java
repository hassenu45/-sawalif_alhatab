package com.sawalif.alhatab.fragments;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.Button;
import android.content.SharedPreferences;
import android.widget.Toast;
import androidx.fragment.app.Fragment;
import com.sawalif.alhatab.R;

public class SettingsFragment extends Fragment {

    private EditText whatsappInput;

    @Override
    public View onCreateView(LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState) {
        View v = inflater.inflate(R.layout.fragment_settings, container, false);
        whatsappInput = v.findViewById(R.id.settingsWhatsapp);
        Button saveBtn = v.findViewById(R.id.settingsSave);
        Button clearBtn = v.findViewById(R.id.settingsClear);

        SharedPreferences prefs = requireActivity().getSharedPreferences("settings", 0);
        String savedNum = prefs.getString("whatsapp", "9665392928583");
        whatsappInput.setText(savedNum);

        saveBtn.setOnClickListener(view -> {
            String num = whatsappInput.getText().toString().trim();
            if (num.isEmpty()) {
                Toast.makeText(getContext(), "الرجاء إدخال رقم", Toast.LENGTH_SHORT).show();
                return;
            }
            prefs.edit().putString("whatsapp", num).apply();
            Toast.makeText(getContext(), "تم الحفظ", Toast.LENGTH_SHORT).show();
        });

        clearBtn.setOnClickListener(view -> {
            requireActivity().getSharedPreferences("orders", 0).edit().clear().apply();
            Toast.makeText(getContext(), "تم مسح الطلبات", Toast.LENGTH_SHORT).show();
        });

        return v;
    }

    public String getWhatsappNumber() {
        return requireActivity().getSharedPreferences("settings", 0)
                .getString("whatsapp", "9665392928583");
    }
}
