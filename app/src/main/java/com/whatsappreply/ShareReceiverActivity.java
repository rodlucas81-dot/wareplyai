package com.whatsappreply;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.text.TextUtils;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class ShareReceiverActivity extends Activity {

    // Calls go through the Netlify Function which holds the Anthropic API key
    // server-side. No per-user key required, no key in the APK.
    private static final String PROXY_URL = "https://smarreplies.netlify.app/api/claude";
    private static final String MODEL = "claude-sonnet-4-5";

    private String chatText = "";
    private String yourName = "";
    private List<String> senders = new ArrayList<>();

    // Conversation history for refinements
    private List<JSONObject> conversationHistory = new ArrayList<>();
    private String lastRepliesJson = "";

    // User preferences
    private String selectedRelationship = "";
    private String selectedTone = "Natural";
    private String selectedLength = "Medium";
    private String relationship = "";

    // State for personal-question flow
    private JSONArray pendingGroups = null;
    private int currentPersonalIdx = -1;
    private List<String> personalAnswers = new ArrayList<>();

    private LinearLayout nameSelectorLayout;
    private LinearLayout nameButtonsContainer;
    private LinearLayout contextInputLayout;
    private LinearLayout loadingLayout;
    private LinearLayout resultsContainer;
    private LinearLayout personalQuestionLayout;
    private LinearLayout refinementLayout;
    private LinearLayout chipContainer;
    private EditText contextInput;
    private EditText personalAnswerInput;
    private EditText refinementInput;
    private TextView errorText;
    private TextView contactName;
    private TextView personalQuestionText;
    private Button generateBtn;
    private Button submitAnswerBtn;
    private Button refinementBtn;
    private LinearLayout relationshipContainer;
    private LinearLayout toneContainer;
    private LinearLayout lengthContainer;
    private LinearLayout relationshipSelectorLayout;
    private LinearLayout relationshipChipContainer;

    private ExecutorService executor = Executors.newSingleThreadExecutor();
    private Handler mainHandler = new Handler(Looper.getMainLooper());

    private static final String[] QUICK_CHIPS = {
        "Make it shorter", "Make it longer", "Less formal", "More formal",
        "Add a joke", "Be more direct", "Softer tone", "More enthusiastic"
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_share);

        nameSelectorLayout = findViewById(R.id.nameSelectorLayout);
        nameButtonsContainer = findViewById(R.id.nameButtonsContainer);
        contextInputLayout = findViewById(R.id.contextInputLayout);
        loadingLayout = findViewById(R.id.loadingLayout);
        resultsContainer = findViewById(R.id.resultsContainer);
        personalQuestionLayout = findViewById(R.id.personalQuestionLayout);
        refinementLayout = findViewById(R.id.refinementLayout);
        chipContainer = findViewById(R.id.chipContainer);
        contextInput = findViewById(R.id.contextInput);
        personalAnswerInput = findViewById(R.id.personalAnswerInput);
        refinementInput = findViewById(R.id.refinementInput);
        errorText = findViewById(R.id.errorText);
        contactName = findViewById(R.id.contactName);
        personalQuestionText = findViewById(R.id.personalQuestionText);
        generateBtn = findViewById(R.id.generateBtn);
        submitAnswerBtn = findViewById(R.id.submitAnswerBtn);
        refinementBtn = findViewById(R.id.refinementBtn);
        relationshipContainer = findViewById(R.id.relationshipContainer);
        toneContainer = findViewById(R.id.toneContainer);
        lengthContainer = findViewById(R.id.lengthContainer);
        relationshipSelectorLayout = findViewById(R.id.relationshipSelectorLayout);
        relationshipChipContainer = findViewById(R.id.relationshipChipContainer);

        generateBtn.setOnClickListener(v -> fetchSuggestions());
        submitAnswerBtn.setOnClickListener(v -> submitPersonalAnswer());
        refinementBtn.setOnClickListener(v -> submitRefinement());

        refinementInput.setOnEditorActionListener((v, actionId, event) -> {
            submitRefinement(); return true;
        });

        // Build quick chips
        for (String chip : QUICK_CHIPS) {
            Button b = new Button(this);
            b.setText(chip);
            b.setTextSize(12f);
            b.setTextColor(Color.parseColor("#25D366"));
            b.setBackground(getDrawable(R.drawable.chip_selector));
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            p.setMarginEnd(8);
            b.setLayoutParams(p);
            b.setPadding(24, 12, 24, 12);
            b.setOnClickListener(v -> {
                refinementInput.setText(chip);
                submitRefinement();
            });
            chipContainer.addView(b);
        }

        buildOptionChips(relationshipContainer,
            new String[]{"Friend", "Partner", "Family", "Boss", "Colleague", "Acquaintance"},
            val -> selectedRelationship = val, "");
        buildRelationshipChips();
        buildOptionChips(toneContainer,
            new String[]{"Natural", "Chill", "Professional", "Flirty", "Direct"},
            val -> selectedTone = val, "Natural");
        buildOptionChips(lengthContainer,
            new String[]{"Short", "Medium", "Long"},
            val -> selectedLength = val, "Medium");

        handleIntent(getIntent());
    }

    interface OptionListener { void onSelect(String value); }

    private void buildOptionChips(LinearLayout container, String[] options, OptionListener listener, String defaultValue) {
        for (String option : options) {
            Button chip = new Button(this);
            chip.setText(option);
            chip.setTextSize(12f);
            boolean isDefault = option.equals(defaultValue);
            chip.setTextColor(Color.parseColor(isDefault ? "#25D366" : "#bbbbbb"));
            chip.setSelected(isDefault);
            chip.setBackground(getDrawable(R.drawable.chip_selector));
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            p.setMarginEnd(8);
            chip.setLayoutParams(p);
            chip.setPadding(24, 12, 24, 12);
            chip.setOnClickListener(v -> {
                for (int i = 0; i < container.getChildCount(); i++) {
                    Button c = (Button) container.getChildAt(i);
                    c.setSelected(false);
                    c.setTextColor(Color.parseColor("#bbbbbb"));
                }
                chip.setSelected(true);
                chip.setTextColor(Color.parseColor("#25D366"));
                listener.onSelect(option);
            });
            container.addView(chip);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        String type = intent.getType();
        if (Intent.ACTION_SEND.equals(action) && type != null) {
            if ("text/plain".equals(type)) {
                String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
                if (sharedText != null) { chatText = sharedText; processChat(); return; }
            }
            Uri fileUri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (fileUri != null) { readFileUri(fileUri); return; }
        }
        showError("No chat data received. Please share a WhatsApp chat export.");
    }

    private void readFileUri(Uri uri) {
        executor.execute(() -> {
            try {
                InputStream peek = getContentResolver().openInputStream(uri);
                byte[] magic = new byte[4]; peek.read(magic, 0, 4); peek.close();
                boolean isZip = (magic[0] == 0x50 && magic[1] == 0x4B);
                InputStream is = getContentResolver().openInputStream(uri);
                chatText = isZip ? readFromZip(is) : readText(is);
                mainHandler.post(this::processChat);
            } catch (Exception e) {
                mainHandler.post(() -> showError("Could not read file: " + e.getMessage()));
            }
        });
    }

    private String readFromZip(InputStream is) throws Exception {
        java.util.zip.ZipInputStream zis = new java.util.zip.ZipInputStream(is);
        java.util.zip.ZipEntry entry;
        while ((entry = zis.getNextEntry()) != null)
            if (entry.getName().toLowerCase().endsWith(".txt")) return readText(zis);
        throw new Exception("No .txt file found inside the zip.");
    }

    private String readText(InputStream is) throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(is, "UTF-8"));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) sb.append(line).append("\n");
        reader.close();
        String text = sb.toString().trim();
        if (text.startsWith("{") && text.contains("\"messages\"")) {
            String converted = convertTelegramJSON(text);
            if (converted != null) return converted;
        }
        return sb.toString();
    }

    private String convertTelegramJSON(String json) {
        try {
            JSONObject obj = new JSONObject(json);
            JSONArray messages = obj.getJSONArray("messages");
            StringBuilder result = new StringBuilder();
            for (int i = 0; i < messages.length(); i++) {
                JSONObject msg = messages.getJSONObject(i);
                if (!"message".equals(msg.optString("type"))) continue;
                String from = msg.optString("from", "Unknown");
                String text = "";
                Object textObj = msg.opt("text");
                if (textObj instanceof String) {
                    text = (String) textObj;
                } else if (textObj instanceof JSONArray) {
                    JSONArray arr = (JSONArray) textObj;
                    StringBuilder tb = new StringBuilder();
                    for (int j = 0; j < arr.length(); j++) {
                        Object seg = arr.get(j);
                        if (seg instanceof String) tb.append(seg);
                        else if (seg instanceof JSONObject) tb.append(((JSONObject) seg).optString("text", ""));
                    }
                    text = tb.toString();
                }
                if (text.trim().isEmpty() || isSystemMessage(text.trim())) continue;
                String date = msg.optString("date", "");
                result.append(formatTelegramDate(date)).append(" - ").append(from).append(": ").append(text).append("\n");
            }
            return result.toString();
        } catch (Exception e) {
            return null;
        }
    }

    private String formatTelegramDate(String isoDate) {
        try {
            String[] parts = isoDate.split("T");
            String[] dateParts = parts[0].split("-");
            String time = parts[1].substring(0, 5);
            return dateParts[2] + "/" + dateParts[1] + "/" + dateParts[0] + ", " + time;
        } catch (Exception e) {
            return "01/01/2023, 00:00";
        }
    }

    private void processChat() {
        if (chatText == null || chatText.trim().isEmpty()) { showError("Chat appears to be empty."); return; }
        senders = parseSenders(chatText);
        nameSelectorLayout.setVisibility(View.VISIBLE);
        nameButtonsContainer.removeAllViews();

        LinearLayout currentRow = null;
        for (int idx = 0; idx < senders.size(); idx++) {
            String sender = senders.get(idx);
            boolean isLeftChip = (idx % 2 == 0);

            if (isLeftChip) {
                currentRow = new LinearLayout(this);
                currentRow.setOrientation(LinearLayout.HORIZONTAL);
                LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
                rowParams.setMargins(0, 0, 0, 8);
                currentRow.setLayoutParams(rowParams);
                nameButtonsContainer.addView(currentRow);
            }

            String displayName = sender.length() > 22 ? sender.substring(0, 20) + "…" : sender;
            Button chip = new Button(this);
            chip.setText(displayName);
            chip.setSingleLine(true);
            chip.setEllipsize(TextUtils.TruncateAt.END);
            chip.setTextColor(Color.parseColor("#bbbbbb"));
            chip.setTextSize(13f);
            chip.setBackground(getDrawable(R.drawable.chip_selector));
            chip.setPadding(24, 16, 24, 16);

            LinearLayout.LayoutParams chipParams = new LinearLayout.LayoutParams(
                    0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
            if (isLeftChip) chipParams.setMarginEnd(8);
            chip.setLayoutParams(chipParams);

            chip.setOnClickListener(v -> {
                yourName = sender;
                // Deselect all chips across all rows
                for (int r = 0; r < nameButtonsContainer.getChildCount(); r++) {
                    LinearLayout row = (LinearLayout) nameButtonsContainer.getChildAt(r);
                    for (int c = 0; c < row.getChildCount(); c++) {
                        Button b = (Button) row.getChildAt(c);
                        b.setSelected(false);
                        b.setTextColor(Color.parseColor("#bbbbbb"));
                    }
                }
                chip.setSelected(true);
                chip.setTextColor(Color.parseColor("#25D366"));
                relationshipSelectorLayout.setVisibility(View.VISIBLE);
                contextInputLayout.setVisibility(View.VISIBLE);
            });

            currentRow.addView(chip);

            // If last sender lands on left slot, add an invisible spacer to fill the right slot
            if (isLeftChip && idx == senders.size() - 1) {
                View spacer = new View(this);
                LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(0,
                        LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
                sp.setMarginEnd(8);
                spacer.setLayoutParams(sp);
                currentRow.addView(spacer);
            }
        }

    }

    private List<String> parseSenders(String text) {
        LinkedHashSet<String> found = new LinkedHashSet<>();
        String[] patterns = {
            "^\\[\\d{1,2}/\\d{1,2}/\\d{2,4},?\\s+\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?\\]\\s+(.+?):",
            "^\\d{1,2}/\\d{1,2}/\\d{2,4},?\\s+\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?\\s+-\\s+(.+?):",
            "^\\[\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?\\]\\s+(.+?):",
            "^\\[\\d{1,2}\\.\\d{1,2}\\.\\d{4}\\s+\\d{2}:\\d{2}\\]\\s+(.+?):",
        };
        for (String pat : patterns) {
            Pattern p = Pattern.compile(pat, Pattern.MULTILINE);
            Matcher m = p.matcher(text);
            while (m.find()) {
                String name = m.group(1).trim();
                if (!name.isEmpty() && !name.equals("You") && name.length() < 40) found.add(name);
            }
            if (!found.isEmpty()) break;
        }
        return new ArrayList<>(found);
    }

    private List<String[]> findUnansweredMessages() {
        String[] patterns = {
            "^(\\[\\d{1,2}/\\d{1,2}/\\d{2,4},?\\s+\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?\\])\\s+(.+?):\\s(.+)$",
            "^(\\d{1,2}/\\d{1,2}/\\d{2,4},?\\s+\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?\\s+-\\s+)(.+?):\\s(.+)$",
        };
        Pattern usedPattern = null;
        for (String pat : patterns) {
            Pattern p = Pattern.compile(pat, Pattern.MULTILINE);
            if (p.matcher(chatText).find()) { usedPattern = p; break; }
        }
        if (usedPattern == null) return new ArrayList<>();

        List<String[]> messages = new ArrayList<>();
        StringBuilder currentText = new StringBuilder();
        String currentSender = null;
        for (String line : chatText.split("\n")) {
            Matcher m = usedPattern.matcher(line);
            if (m.find()) {
                if (currentSender != null) {
                    String msgText = currentText.toString().trim();
                    if (!isSystemMessage(msgText)) messages.add(new String[]{currentSender, msgText});
                }
                currentSender = m.group(2).trim();
                currentText = new StringBuilder(m.group(3));
            } else if (currentSender != null && !line.trim().isEmpty()) {
                currentText.append(" ").append(line.trim());
            }
        }
        if (currentSender != null) {
            String msgText = currentText.toString().trim();
            if (!isSystemMessage(msgText)) messages.add(new String[]{currentSender, msgText});
        }

        int lastMyIdx = -1;
        for (int i = messages.size() - 1; i >= 0; i--)
            if (messages.get(i)[0].equals(yourName)) { lastMyIdx = i; break; }

        List<String[]> unanswered = new ArrayList<>();
        for (int i = lastMyIdx + 1; i < messages.size(); i++) {
            String[] msg = messages.get(i);
            if (!msg[0].equals(yourName) && !msg[1].isEmpty()) unanswered.add(msg);
        }
        if (unanswered.size() > 5) unanswered = unanswered.subList(unanswered.size() - 5, unanswered.size());
        return unanswered;
    }

    private void fetchSuggestions() {
        conversationHistory.clear();
        loadingLayout.setVisibility(View.VISIBLE);
        resultsContainer.removeAllViews();
        errorText.setVisibility(View.GONE);
        refinementLayout.setVisibility(View.GONE);
        personalQuestionLayout.setVisibility(View.GONE);
        pendingGroups = null;
        personalAnswers.clear();

        List<String[]> unanswered = findUnansweredMessages();
        String extraContext = contextInput.getText().toString().trim();

        String[] lines = chatText.split("\n");
        int start = Math.max(0, lines.length - 100);
        StringBuilder trimmed = new StringBuilder();
        for (int i = start; i < lines.length; i++) {
            if (!isSystemLine(lines[i])) trimmed.append(lines[i]).append("\n");
        }

        final String chatCtx = trimmed.toString();
        final List<String[]> finalUnanswered = unanswered;

        executor.execute(() -> {
            try {
                String result = callClaudeAPI(chatCtx, finalUnanswered, extraContext, null);
                mainHandler.post(() -> handleAPIResult(result, finalUnanswered));
            } catch (Exception e) {
                mainHandler.post(() -> { loadingLayout.setVisibility(View.GONE); showError("Error: " + e.getMessage()); });
            }
        });
    }

    private void handleAPIResult(String jsonStr, List<String[]> unanswered) {
        loadingLayout.setVisibility(View.GONE);
        try {
            JSONObject data = new JSONObject(jsonStr);
            if (data.optBoolean("needsPersonalInfo", false)) {
                pendingGroups = new JSONArray();
                pendingGroups.put(data);
                personalAnswers = new ArrayList<>();
                personalAnswers.add("");
                currentPersonalIdx = 0;
                String question = data.optString("personalQuestion", "Can you share more details?");
                String context = data.optString("personalMessageContext", "");
                personalQuestionLayout.setVisibility(View.VISIBLE);
                personalAnswerInput.setText("");
                personalAnswerInput.requestFocus();
                personalQuestionText.setText((context.isEmpty() ? "" : "Re: \"" + context + "\"\n\n") + question);
            } else {
                displayResults(data);
            }
        } catch (Exception e) {
            showError("Could not parse: " + e.getMessage() + "\n\n" + jsonStr);
        }
    }

    private void submitPersonalAnswer() {
        String answer = personalAnswerInput.getText().toString().trim();
        if (answer.isEmpty()) { Toast.makeText(this, "Please enter an answer", Toast.LENGTH_SHORT).show(); return; }
        personalAnswers.set(0, answer);
        personalQuestionLayout.setVisibility(View.GONE);
        fetchWithPersonalAnswers();
    }

    private void fetchWithPersonalAnswers() {
        loadingLayout.setVisibility(View.VISIBLE);
        resultsContainer.removeAllViews();
        List<String[]> unanswered = findUnansweredMessages();
        String extraContext = contextInput.getText().toString().trim();
        String[] lines = chatText.split("\n");
        int start = Math.max(0, lines.length - 100);
        StringBuilder trimmed = new StringBuilder();
        for (int i = start; i < lines.length; i++) {
            if (!isSystemLine(lines[i])) trimmed.append(lines[i]).append("\n");
        }
        String answers = "My answer: " + personalAnswers.get(0);
        final String chatCtx = trimmed.toString();
        final List<String[]> finalUnanswered = unanswered;
        final String finalAnswers = answers;
        executor.execute(() -> {
            try {
                String result = callClaudeAPI(chatCtx, finalUnanswered, extraContext, finalAnswers);
                mainHandler.post(() -> {
                    loadingLayout.setVisibility(View.GONE);
                    try { displayResults(new JSONObject(result)); }
                    catch (Exception e) { showError("Parse error: " + e.getMessage()); }
                });
            } catch (Exception e) {
                mainHandler.post(() -> { loadingLayout.setVisibility(View.GONE); showError("Error: " + e.getMessage()); });
            }
        });
    }

    private void buildRelationshipChips() {
        String[] labels = {"Client", "Friend", "Family", "Partner", "Boss", "Coworker", "Stranger"};
        for (String label : labels) {
            Button chip = new Button(this);
            chip.setText(label);
            chip.setTextSize(12f);
            chip.setTextColor(Color.parseColor("#bbbbbb"));
            chip.setBackground(getDrawable(R.drawable.chip_selector));
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            p.setMarginEnd(8);
            chip.setLayoutParams(p);
            chip.setPadding(24, 12, 24, 12);
            chip.setOnClickListener(v -> {
                relationship = label;
                for (int i = 0; i < relationshipChipContainer.getChildCount(); i++) {
                    Button c = (Button) relationshipChipContainer.getChildAt(i);
                    c.setSelected(false);
                    c.setTextColor(Color.parseColor("#bbbbbb"));
                }
                chip.setSelected(true);
                chip.setTextColor(Color.parseColor("#25D366"));
            });
            relationshipChipContainer.addView(chip);
        }
    }

    private boolean isSystemMessage(String text) {
        if (text == null) return true;
        String t = text.trim();
        if (t.length() < 3) return true;
        String lower = t.toLowerCase();
        if (lower.contains("your business is now using a secure service")) return true;
        if (lower.contains("messages and calls are end-to-end encrypted")) return true;
        if (lower.contains("tap to learn more")) return true;
        if (lower.startsWith("voice message")) return true;
        if (lower.contains("transcrição com ia por") || lower.contains("transcribed with") || lower.contains("transcription by")) return true;
        if (lower.contains("<media omitted>") || lower.contains("image omitted") || lower.contains("audio omitted") || lower.contains("video omitted") || lower.contains("sticker omitted")) return true;
        if (lower.contains("joined using this group's invite link")) return true;
        if (lower.contains("left the group")) return true;
        if (lower.contains("changed the subject")) return true;
        if (lower.contains("added") && t.length() < 80) return true;
        if (lower.contains("removed") && t.length() < 80) return true;
        return false;
    }

    private boolean isSystemLine(String line) {
        String lower = line.toLowerCase();
        return lower.contains("end-to-end encrypted")
            || lower.contains("tap to learn more")
            || lower.contains("your business is now using a secure service")
            || lower.contains("<media omitted>")
            || lower.contains("image omitted")
            || lower.contains("audio omitted")
            || lower.contains("video omitted")
            || lower.contains("sticker omitted")
            || lower.contains("transcrição com ia por")
            || lower.contains("transcribed with")
            || lower.contains("transcription by")
            || lower.contains("joined using this group's invite link")
            || lower.contains("left the group")
            || lower.contains("changed the subject");
    }

    private List<String> extractMyMessages() {
        String[] patterns = {
            "^(\\[\\d{1,2}/\\d{1,2}/\\d{2,4},?\\s+\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?\\])\\s+(.+?):\\s(.+)$",
            "^(\\d{1,2}/\\d{1,2}/\\d{2,4},?\\s+\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?\\s+-\\s+)(.+?):\\s(.+)$",
        };
        Pattern usedPattern = null;
        for (String pat : patterns) {
            Pattern p = Pattern.compile(pat, Pattern.MULTILINE);
            if (p.matcher(chatText).find()) { usedPattern = p; break; }
        }
        if (usedPattern == null) return new ArrayList<>();

        List<String> myMessages = new ArrayList<>();
        Matcher m = usedPattern.matcher(chatText);
        while (m.find()) {
            String sender = m.group(2).trim();
            String text = m.group(3).trim();
            if (sender.equals(yourName) && !text.isEmpty() && !isSystemMessage(text)) myMessages.add(text);
        }
        if (myMessages.size() > 20) myMessages = myMessages.subList(myMessages.size() - 20, myMessages.size());
        return myMessages;
    }

    private String callClaudeAPI(String chatContext, List<String[]> unanswered, String extraContext, String personalAnswers) throws Exception {
        StringBuilder prompt = new StringBuilder();
        prompt.append("Here is a WhatsApp conversation:\n\n").append(chatContext).append("\n\n");
        prompt.append("I am \"").append(yourName).append("\" and need to reply.\n");
        if (!selectedRelationship.isEmpty()) prompt.append("This person is my ").append(selectedRelationship).append(".\n");
        prompt.append("Desired tone: ").append(selectedTone).append(".\n");
        if (selectedLength.equals("Short")) prompt.append("Reply length: very short — 1-2 sentences max.\n");
        else if (selectedLength.equals("Long")) prompt.append("Reply length: detailed — 3-5 sentences, elaborate.\n");
        else prompt.append("Reply length: moderate — 2-3 sentences.\n");
        if (!extraContext.isEmpty()) prompt.append("Additional context: ").append(extraContext).append("\n");
        if (personalAnswers != null && !personalAnswers.isEmpty())
            prompt.append("\nPersonal info I provided:\n").append(personalAnswers).append("\n");

        if (unanswered.isEmpty()) {
            prompt.append("\nAnalyze the last message and reply to it.\n");
        } else {
            prompt.append("\nThere are ").append(unanswered.size()).append(" unanswered message(s) I need to reply to:\n");
            for (int i = 0; i < unanswered.size(); i++)
                prompt.append((i+1)).append(". ").append(unanswered.get(i)[0]).append(": ").append(unanswered.get(i)[1]).append("\n");
        }

        prompt.append("\nFirst, check if any message requires personal info only I would know ");
        prompt.append("(e.g. what I ate, where I want to go, my personal plans, opinions on things only I know).\n\n");

        if (personalAnswers == null) {
            prompt.append("If ANY message needs personal info: set needsPersonalInfo=true and ask one SHORT question. Leave replies empty.\n");
            prompt.append("If NO messages need personal info: set needsPersonalInfo=false and generate ONE consolidated reply covering ALL messages together.\n\n");
        } else {
            prompt.append("Using the personal info I provided, generate ONE consolidated reply covering ALL messages.\n\n");
        }

        List<String> myMessages = extractMyMessages();
        if (!myMessages.isEmpty()) {
            prompt.append("\nHere are samples of how I actually write (my recent messages in this chat):\n");
            for (String msg : myMessages) prompt.append("- ").append(msg).append("\n");
            prompt.append("\nIMPORTANT: Mirror my writing style exactly — match my vocabulary, sentence length, emoji usage, punctuation, slang, and formality level in ALL reply suggestions.\n");
        }

        if (!relationship.isEmpty()) {
            prompt.append("My relationship with the other person: ").append(relationship).append(". Adjust tone, formality, and content accordingly.\n");
        }

        prompt.append("\nThe reply must read like ONE natural WhatsApp message — not bullet points, not separate paragraphs per topic. ");
        prompt.append("Flow naturally from topic to topic the way a real person would text.\n");
        prompt.append("Detect the conversation language and reply in the SAME language.\n\n");
        prompt.append("Respond ONLY with JSON (no markdown, no preamble):\n");
        prompt.append("{\n");
        prompt.append("  \"summary\": \"one sentence about the conversation\",\n");
        prompt.append("  \"needsPersonalInfo\": false,\n");
        prompt.append("  \"personalQuestion\": \"(only if needsPersonalInfo=true) short question for me\",\n");
        prompt.append("  \"personalMessageContext\": \"(only if needsPersonalInfo=true) which message needs info\",\n");
        prompt.append("  \"replies\": [\n");
        prompt.append("    {\"style\": \"Friendly\", \"emoji\": \"💬\", \"text\": \"one natural message covering everything\"},\n");
        prompt.append("    {\"style\": \"Thoughtful\", \"emoji\": \"✍️\", \"text\": \"one natural message covering everything\"},\n");
        prompt.append("    {\"style\": \"Snappy\", \"emoji\": \"⚡\", \"text\": \"one natural message covering everything\"},\n");
        prompt.append("    {\"style\": \"Humor\", \"emoji\": \"😂\", \"text\": \"one natural message covering everything — witty, playful, with a joke or light sarcasm\"}\n");
        prompt.append("  ]\n");
        prompt.append("}");

        JSONObject requestBody = new JSONObject();
        requestBody.put("model", MODEL);
        requestBody.put("max_tokens", 2000);
        requestBody.put("system", "You are a WhatsApp reply assistant. Always respond ONLY with valid JSON. No preamble, no markdown fences.");
        JSONArray messages = new JSONArray();
        JSONObject userMsg = new JSONObject();
        userMsg.put("role", "user");
        userMsg.put("content", prompt.toString());
        messages.put(userMsg);
        requestBody.put("messages", messages);

        // Store in history for refinements
        conversationHistory.add(userMsg);

        URL url = new URL(PROXY_URL);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setDoOutput(true);
        conn.setConnectTimeout(30000);
        conn.setReadTimeout(60000);
        OutputStream os = conn.getOutputStream();
        os.write(requestBody.toString().getBytes("UTF-8"));
        os.close();

        int responseCode = conn.getResponseCode();
        InputStream is = responseCode == 200 ? conn.getInputStream() : conn.getErrorStream();
        BufferedReader reader = new BufferedReader(new InputStreamReader(is, "UTF-8"));
        StringBuilder response = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) response.append(line);
        reader.close();

        if (responseCode != 200) throw new Exception("API error " + responseCode + ": " + response.toString());
        JSONObject resp = new JSONObject(response.toString());
        String text = resp.getJSONArray("content").getJSONObject(0).getString("text");
        return text.replaceAll("```json", "").replaceAll("```", "").trim();
    }

    private void displayResults(JSONObject data) throws Exception {
        resultsContainer.removeAllViews();
        LayoutInflater inflater = LayoutInflater.from(this);

        // Summary card
        String summary = data.optString("summary", "");
        if (!summary.isEmpty()) {
            View summaryCard = inflater.inflate(R.layout.item_reply, resultsContainer, false);
            ((TextView) summaryCard.findViewById(R.id.replyLabel)).setText("CONVERSATION SUMMARY");
            ((TextView) summaryCard.findViewById(R.id.replyText)).setText(summary);
            summaryCard.findViewById(R.id.copyBtn).setVisibility(View.GONE);
            resultsContainer.addView(summaryCard);
        }

        // Three reply options as flat cards
        JSONArray replies = data.optJSONArray("replies");
        if (replies != null) {
            for (int r = 0; r < replies.length(); r++) {
                JSONObject reply = replies.getJSONObject(r);
                String style = reply.optString("style", "Reply");
                String emoji = reply.optString("emoji", "💬");
                String text = reply.optString("text", "");

                View card = inflater.inflate(R.layout.item_reply, resultsContainer, false);
                int accentColor = getStyleColor(style);
                float density = getResources().getDisplayMetrics().density;
                GradientDrawable cardBg = new GradientDrawable();
                cardBg.setColor(Color.parseColor("#141e19"));
                cardBg.setCornerRadius(18 * density);
                cardBg.setStroke(Math.round(1.5f * density), accentColor);
                card.setBackground(cardBg);
                TextView labelView = card.findViewById(R.id.replyLabel);
                labelView.setText(emoji + " " + style.toUpperCase());
                labelView.setTextColor(accentColor);
                ((TextView) card.findViewById(R.id.replyText)).setText(text);

                final String finalText = text;

                Button copyBtn = card.findViewById(R.id.copyBtn);
                copyBtn.setOnClickListener(v -> {
                    copyToClipboard(finalText);
                    copyBtn.setText("Copied!");
                    copyBtn.setTextColor(Color.parseColor("#25D366"));
                    mainHandler.postDelayed(() -> {
                        copyBtn.setText("Copy");
                        copyBtn.setTextColor(Color.parseColor("#aaaaaa"));
                    }, 2000);
                    Toast.makeText(this, "Copied! Switch to WhatsApp to paste.", Toast.LENGTH_SHORT).show();
                });

                Button favBtn = card.findViewById(R.id.favBtn);
                SharedPreferences prefs = getSharedPreferences("favorites", MODE_PRIVATE);
                String favKey = String.valueOf(finalText.hashCode());
                updateFavBtn(favBtn, prefs.getBoolean(favKey, false));
                favBtn.setOnClickListener(v -> {
                    boolean nowFav = !prefs.getBoolean(favKey, false);
                    prefs.edit().putBoolean(favKey, nowFav).apply();
                    updateFavBtn(favBtn, nowFav);
                    Toast.makeText(this, nowFav ? "Saved to favorites!" : "Removed from favorites", Toast.LENGTH_SHORT).show();
                });

                Button shareBtn = card.findViewById(R.id.shareBtn);
                shareBtn.setOnClickListener(v -> {
                    copyToClipboard(finalText);
                    Intent wa = new Intent(Intent.ACTION_SEND);
                    wa.setType("text/plain");
                    wa.setPackage("com.whatsapp");
                    wa.putExtra(Intent.EXTRA_TEXT, finalText);
                    try { startActivity(wa); }
                    catch (Exception e) { Toast.makeText(this, "WhatsApp not installed", Toast.LENGTH_SHORT).show(); }
                });

                resultsContainer.addView(card);
            }
        }
        refinementLayout.setVisibility(View.VISIBLE);
        refinementInput.setText("");

        // Store assistant reply in history for follow-ups
        try {
            JSONObject assistantMsg = new JSONObject();
            assistantMsg.put("role", "assistant");
            assistantMsg.put("content", data.toString());
            conversationHistory.add(assistantMsg);
        } catch (Exception ignored) {}
    }

    private void submitRefinement() {
        String request = refinementInput.getText().toString().trim();
        if (request.isEmpty()) return;

        loadingLayout.setVisibility(View.VISIBLE);
        resultsContainer.removeAllViews();
        refinementLayout.setVisibility(View.GONE);
        refinementInput.setText("");

        // Add user refinement request to history
        try {
            JSONObject userMsg = new JSONObject();
            userMsg.put("role", "user");
            userMsg.put("content", "Please revise the reply suggestions: " + request + "\n\nKeep the same JSON format. Respond ONLY with valid JSON.");
            conversationHistory.add(userMsg);
        } catch (Exception ignored) {}

        final List<JSONObject> history = new ArrayList<>(conversationHistory);

        executor.execute(() -> {
            try {
                String result = callClaudeAPIWithHistory(history);
                mainHandler.post(() -> {
                    loadingLayout.setVisibility(View.GONE);
                    try {
                        JSONObject data = new JSONObject(result.replaceAll("```json", "").replaceAll("```", "").trim());
                        displayResults(data);
                    } catch (Exception e) {
                        showError("Parse error: " + e.getMessage());
                    }
                });
            } catch (Exception e) {
                mainHandler.post(() -> { loadingLayout.setVisibility(View.GONE); showError("Error: " + e.getMessage()); });
            }
        });
    }

    private String callClaudeAPIWithHistory(List<JSONObject> history) throws Exception {
        JSONObject requestBody = new JSONObject();
        requestBody.put("model", MODEL);
        requestBody.put("max_tokens", 2000);
        requestBody.put("system", "You are a WhatsApp reply assistant. Always respond ONLY with valid JSON. No preamble, no markdown fences.");

        JSONArray messages = new JSONArray();
        for (JSONObject msg : history) messages.put(msg);
        requestBody.put("messages", messages);

        URL url = new URL(PROXY_URL);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setDoOutput(true);
        conn.setConnectTimeout(30000);
        conn.setReadTimeout(60000);

        OutputStream os = conn.getOutputStream();
        os.write(requestBody.toString().getBytes("UTF-8"));
        os.close();

        int responseCode = conn.getResponseCode();
        InputStream is = responseCode == 200 ? conn.getInputStream() : conn.getErrorStream();
        BufferedReader reader = new BufferedReader(new InputStreamReader(is, "UTF-8"));
        StringBuilder response = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) response.append(line);
        reader.close();

        if (responseCode != 200) throw new Exception("API error " + responseCode + ": " + response);

        JSONObject resp = new JSONObject(response.toString());
        String text = resp.getJSONArray("content").getJSONObject(0).getString("text");

        // Add this response to history too
        try {
            JSONObject assistantMsg = new JSONObject();
            assistantMsg.put("role", "assistant");
            assistantMsg.put("content", text);
            conversationHistory.add(assistantMsg);
        } catch (Exception ignored) {}

        return text;
    }

    private int getStyleColor(String style) {
        switch (style.toLowerCase()) {
            case "friendly":   return Color.parseColor("#25D366");
            case "thoughtful": return Color.parseColor("#4A9EE8");
            case "snappy":     return Color.parseColor("#FF9500");
            case "humor":      return Color.parseColor("#C77DFF");
            default:           return Color.parseColor("#25D366");
        }
    }

    private void copyToClipboard(String text) {
        ClipboardManager cb = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        cb.setPrimaryClip(ClipData.newPlainText("reply", text));
    }

    private void updateFavBtn(Button btn, boolean isFav) {
        btn.setText(isFav ? "★ Saved" : "☆ Save");
        btn.setTextColor(Color.parseColor(isFav ? "#25D366" : "#aaaaaa"));
    }

    private void showError(String msg) {
        loadingLayout.setVisibility(View.GONE);
        String friendly;
        if (msg.contains("401")) friendly = "Authentication failed on the server. The app's API key may need to be rotated — please contact the developer.";
        else if (msg.contains("429")) friendly = "Too many requests — wait a moment and try again.";
        else if (msg.contains("500") || msg.contains("529")) friendly = "AI service temporarily unavailable. Try again in a moment.";
        else if (msg.contains("UnknownHostException") || msg.contains("timeout") || msg.contains("SocketTimeout"))
            friendly = "No internet connection. Check your network and try again.";
        else if (msg.contains("Could not parse") || msg.contains("Parse error"))
            friendly = "Unexpected AI response. Please try again.";
        else if (msg.contains("empty")) friendly = "The chat appears to be empty. Please try exporting again.";
        else friendly = msg;
        errorText.setVisibility(View.VISIBLE);
        errorText.setText("⚠️ " + friendly);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        executor.shutdown();
    }
}
