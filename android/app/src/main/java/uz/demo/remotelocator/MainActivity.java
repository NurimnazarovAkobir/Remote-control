package uz.demo.remotelocator;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Maxsus native plaginni ro'yxatdan o'tkazamiz (ekran ulashish).
        registerPlugin(ScreenShare.class);
        super.onCreate(savedInstanceState);
    }
}
