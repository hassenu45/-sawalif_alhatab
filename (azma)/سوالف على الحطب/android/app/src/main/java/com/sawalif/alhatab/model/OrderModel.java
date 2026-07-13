package com.sawalif.alhatab.model;

public class OrderModel {
    private String item;
    private String note;
    private long timestamp;

    public OrderModel(String item, String note, long timestamp) {
        this.item = item;
        this.note = note;
        this.timestamp = timestamp;
    }

    public String getItem() { return item; }
    public String getNote() { return note; }
    public long getTimestamp() { return timestamp; }
}
