package com.sawalif.alhatab.adapter;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import androidx.recyclerview.widget.RecyclerView;
import com.sawalif.alhatab.R;
import com.sawalif.alhatab.model.OrderModel;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class OrderAdapter extends RecyclerView.Adapter<OrderAdapter.ViewHolder> {

    private List<OrderModel> orders;
    private OnDeleteListener listener;

    public interface OnDeleteListener {
        void onDelete(int position);
    }

    public OrderAdapter(List<OrderModel> orders, OnDeleteListener listener) {
        this.orders = orders;
        this.listener = listener;
    }

    public static class ViewHolder extends RecyclerView.ViewHolder {
        TextView itemText, noteText, timeText, deleteBtn;

        public ViewHolder(View v) {
            super(v);
            itemText = v.findViewById(R.id.orderItemText);
            noteText = v.findViewById(R.id.orderNoteText);
            timeText = v.findViewById(R.id.orderTimeText);
            deleteBtn = v.findViewById(R.id.orderDeleteBtn);
        }
    }

    @Override
    public ViewHolder onCreateViewHolder(ViewGroup parent, int viewType) {
        View v = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_order, parent, false);
        return new ViewHolder(v);
    }

    @Override
    public void onBindViewHolder(ViewHolder holder, int position) {
        OrderModel order = orders.get(position);
        holder.itemText.setText(order.getItem());
        if (order.getNote() != null && !order.getNote().isEmpty()) {
            holder.noteText.setText("ملاحظة: " + order.getNote());
            holder.noteText.setVisibility(View.VISIBLE);
        } else {
            holder.noteText.setVisibility(View.GONE);
        }
        SimpleDateFormat sdf = new SimpleDateFormat("hh:mm a", new Locale("ar"));
        holder.timeText.setText(sdf.format(new Date(order.getTimestamp())));
        holder.deleteBtn.setOnClickListener(v -> {
            if (listener != null) listener.onDelete(position);
        });
    }

    @Override
    public int getItemCount() { return orders.size(); }
}
