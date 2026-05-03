package com.whatsappreply;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.widget.Button;
import android.widget.EditText;
import android.widget.Toast;

public class MainActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        Button analyzeBtn = findViewById(R.id.analyzePasteBtn);
        EditText pasteInput = findViewById(R.id.pasteChatInput);

        analyzeBtn.setOnClickListener(v -> {
            String chatText = pasteInput.getText().toString().trim();
            if (chatText.isEmpty()) {
                Toast.makeText(this, "Please paste a chat first", Toast.LENGTH_SHORT).show();
                return;
            }
            Intent intent = new Intent(this, ShareReceiverActivity.class);
            intent.setAction(Intent.ACTION_SEND);
            intent.setType("text/plain");
            intent.putExtra(Intent.EXTRA_TEXT, chatText);
            startActivity(intent);
        });
    }
}
