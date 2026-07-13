package com.sawalif.alhatab.fragments;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.RecyclerView;
import androidx.recyclerview.widget.LinearLayoutManager;
import com.sawalif.alhatab.R;
import com.sawalif.alhatab.model.OrderModel;
import com.sawalif.alhatab.adapter.OrderAdapter;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

public class OrdersFragment extends Fragment {

    private RecyclerView recyclerView;
    private TextView emptyView;
    private OrderAdapter adapter;
    private List<OrderModel> orders = new ArrayList<>();

    @Override
    public View onCreateView(LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState) {
        View v = inflater.inflate(R.layout.fragment_orders, container, false);
        recyclerView = v.findViewById(R.id.ordersList);
        emptyView = v.findViewById(R.id.ordersEmpty);

        recyclerView.setLayoutManager(new LinearLayoutManager(getContext()));

        loadOrders();
        return v;
    }

    public void loadOrders() {
        orders.clear();
        try {
            SharedPreferences prefs = requireActivity().getSharedPreferences("orders", 0);
            String json = prefs.getString("list", "[]");
            JSONArray arr = new JSONArray(json);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject obj = arr.getJSONObject(i);
                orders.add(new OrderModel(
                    obj.getString("item"),
                    obj.optString("note", ""),
                    obj.optLong("time", 0)
                ));
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        if (orders.isEmpty()) {
            emptyView.setVisibility(View.VISIBLE);
            recyclerView.setVisibility(View.GONE);
        } else {
            emptyView.setVisibility(View.GONE);
            recyclerView.setVisibility(View.VISIBLE);
            adapter = new OrderAdapter(orders, pos -> {
                removeOrder(pos);
            });
            recyclerView.setAdapter(adapter);
        }
    }

    private void removeOrder(int position) {
        orders.remove(position);
        try {
            SharedPreferences prefs = requireActivity().getSharedPreferences("orders", 0);
            JSONArray arr = new JSONArray();
            for (OrderModel o : orders) {
                JSONObject obj = new JSONObject();
                obj.put("item", o.getItem());
                obj.put("note", o.getNote());
                obj.put("time", o.getTimestamp());
                arr.put(obj);
            }
            prefs.edit().putString("list", arr.toString()).apply();
        } catch (Exception e) {
            e.printStackTrace();
        }
        loadOrders();
    }

    public void refresh() {
        loadOrders();
    }
}
