#include <iostream>
#include <string>
#include <vector>
#include <fstream>
#include <cstdio>
#include <sstream>
#include <iomanip>
#include <cctype>
#include <ctime>
#include <cstdlib>
#include <limits>
#include <stdexcept>
#include <future>
#include <chrono>
#include <algorithm>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <direct.h>
#include <io.h>
#else
#include <sys/stat.h>
#include <dirent.h>
#endif

#if defined(_WIN32) && defined(__MINGW32__)
#include <process.h>
#endif

#ifndef _WIN32
#include <unistd.h>
#endif

using namespace std;

bool supportsConsoleEmojis() {
#ifndef _WIN32
    return true;
#else
    return getenv("WT_SESSION") != nullptr
        || getenv("TERM_PROGRAM") != nullptr
        || getenv("ANSICON") != nullptr;
#endif
}

string formatAiReplyForConsole(const string& text) {
    if (supportsConsoleEmojis()) return text;

    string formatted = text;
    const string replacements[][2] = {
        {"\xE2\x80\x98", "'"},
        {"\xE2\x80\x99", "'"},
        {"\xE2\x80\x9C", "\""},
        {"\xE2\x80\x9D", "\""},
        {"\xE2\x80\x93", "-"},
        {"\xE2\x80\x94", "-"},
        {"\xE2\x80\xA6", "..."}
    };

    for (size_t i = 0; i < sizeof(replacements) / sizeof(replacements[0]); ++i) {
        size_t position = 0;
        while ((position = formatted.find(replacements[i][0], position)) != string::npos) {
            formatted.replace(position, replacements[i][0].size(), replacements[i][1]);
            position += replacements[i][1].size();
        }
    }

    string asciiOnly;
    for (unsigned char character : formatted) {
        if (character < 0x80) asciiOnly += static_cast<char>(character);
    }
    return asciiOnly;
}

#if defined(_WIN32) && defined(__MINGW32__)
extern "C" FILE* _popen(const char* command, const char* mode);
extern "C" int _pclose(FILE* pipe);
#endif



/*
//        console a jeno main point gula sundor kore colorful
//        vabe dekhay tai ei function use kora hoiche 
*/

void clearScreen() {           // terminal er **clear** likhlei sob clear hoye jabe
    cout << "\033[2J\033[3J\033[H" << flush;
}

// \033[ mane escape character 
// 2J mane sob clear 
// 3J mane scrollback clear 
// H mane cursor ke top left e niye asha

void pauseScreen() {
    cout << "\nPress Enter to continue...";
    cin.ignore(numeric_limits<streamsize>::max(), '\n');
    cin.get();
}

string colorRed(const string& text) { return "\033[1;31m" + text + "\033[0m"; }
string colorGreen(const string& text) { return "\033[1;32m" + text + "\033[0m"; }
string colorYellow(const string& text) { return "\033[1;33m" + text + "\033[0m"; }
string colorCyan(const string& text) { return "\033[1;36m" + text + "\033[0m"; }

string escapeJson(const string& input) {
    ostringstream escaped;
    const char hexDigits[] = "0123456789abcdef";

    for (unsigned char character : input) {
        switch (character) {
        case '"': escaped << "\\\""; break;
        case '\\': escaped << "\\\\"; break;
        case '\n': escaped << "\\n"; break;
        case '\r': escaped << "\\r"; break;
        case '\t': escaped << "\\t"; break;
        case '\b': escaped << "\\b"; break;
        case '\f': escaped << "\\f"; break;
        default:
            if (character < 0x20) {
                escaped << "\\u00" << hexDigits[character >> 4] << hexDigits[character & 0x0f];
            } else {
                escaped << static_cast<char>(character);
            }
        }
    }

    return escaped.str();
}

void appendUtf8(string& output, unsigned int codePoint) {
    if (codePoint <= 0x7f) {
        output += static_cast<char>(codePoint);
    } else if (codePoint <= 0x7ff) {
        output += static_cast<char>(0xc0 | (codePoint >> 6));
        output += static_cast<char>(0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
        output += static_cast<char>(0xe0 | (codePoint >> 12));
        output += static_cast<char>(0x80 | ((codePoint >> 6) & 0x3f));
        output += static_cast<char>(0x80 | (codePoint & 0x3f));
    } else {
        output += static_cast<char>(0xf0 | (codePoint >> 18));
        output += static_cast<char>(0x80 | ((codePoint >> 12) & 0x3f));
        output += static_cast<char>(0x80 | ((codePoint >> 6) & 0x3f));
        output += static_cast<char>(0x80 | (codePoint & 0x3f));
    }
}

bool readJsonHexCodeUnit(const string& json, size_t position, unsigned int& codeUnit) {
    if (position + 4 > json.size()) return false;
    codeUnit = 0;
    for (size_t i = position; i < position + 4; ++i) {
        const char character = json[i];
        codeUnit <<= 4;
        if (character >= '0' && character <= '9') codeUnit |= character - '0';
        else if (character >= 'a' && character <= 'f') codeUnit |= character - 'a' + 10;
        else if (character >= 'A' && character <= 'F') codeUnit |= character - 'A' + 10;
        else return false;
    }
    return true;
}

string decodeJsonString(const string& json, size_t start) {
    string decoded;
    for (size_t i = start; i < json.size(); ++i) {
        char character = json[i];
        if (character == '"') return decoded;
        if (character != '\\') {
            decoded += character;
            continue;
        }

        if (++i >= json.size()) return "";
        character = json[i];
        switch (character) {
        case '"': decoded += '"'; break;
        case '\\': decoded += '\\'; break;
        case '/': decoded += '/'; break;
        case 'b': decoded += '\b'; break;
        case 'f': decoded += '\f'; break;
        case 'n': decoded += '\n'; break;
        case 'r': decoded += '\r'; break;
        case 't': decoded += '\t'; break;
        case 'u': {
            unsigned int codePoint;
            if (!readJsonHexCodeUnit(json, i + 1, codePoint)) return "";
            i += 4;
            if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
                if (i + 6 >= json.size() || json[i + 1] != '\\' || json[i + 2] != 'u') return "";
                unsigned int lowSurrogate;
                if (!readJsonHexCodeUnit(json, i + 3, lowSurrogate)
                    || lowSurrogate < 0xdc00 || lowSurrogate > 0xdfff) return "";
                codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (lowSurrogate - 0xdc00);
                i += 6;
            }
            appendUtf8(decoded, codePoint);
            break;
        }
        default: return "";
        }
    }
    return "";
}

bool isOllamaServerOnline() {
    const string command = "curl -s --connect-timeout 1 --max-time 2 "
        "\"http://localhost:11434/api/tags\"";
#ifdef _WIN32
    FILE* pipe = _popen(command.c_str(), "r");
#else
    FILE* pipe = popen(command.c_str(), "r");
#endif
    if (!pipe) return false;

    string response;
    char buffer[1024];
    while (fgets(buffer, sizeof(buffer), pipe)) {
        response += buffer;
    }
#ifdef _WIN32
    const int curlStatus = _pclose(pipe);
#else
    const int curlStatus = pclose(pipe);
#endif
    return curlStatus == 0 && !response.empty();
}

string askMediNaHealthAI(const vector<pair<string, string>>& chatHistory) {
    ofstream payload("ollama_payload.json", ios::binary);
    if (!payload) {
        return "[ERROR] Unable to create Ollama request payload.";
    }
    payload << "{\"model\":\"gemma3:4b\",\"stream\":false,"
            << "\"options\":{\"temperature\":0.7,\"num_predict\":650},"
            << "\"messages\":["
            << "{\"role\":\"system\",\"content\":\""
            << "You are MediNa AI, a warm, intelligent Health Assistant inside a Pharmacy Management System. "
            << "Maintain full continuity with the ongoing conversation: NEVER re-introduce yourself after the first greeting, "
            << "and always connect follow-up replies directly to what the user just discussed. "
            << "Match your length to the user's intent: keep simple greetings and casual replies brief (1-2 natural sentences), "
            << "and when the user asks for health advice, symptoms, or general information on a condition (like high blood pressure), "
            << "immediately give clear, practical, structured guidance using short numbered points without unnecessary filler. "
            << "Never use ** or ## markdown symbols. Reply in English, or clear Banglish if the user asks for Bangla."
            << "\"}";
    for (size_t i = 0; i < chatHistory.size(); ++i) {
        payload << ",{\"role\":\"" << (chatHistory[i].first == "USER" ? "user" : "assistant")
                << "\",\"content\":\"" << escapeJson(chatHistory[i].second) << "\"}";
    }
    payload << "]}";
    payload.close();
    if (!payload) {
        remove("ollama_payload.json");
        return "[ERROR] Unable to write Ollama request payload.";
    }

    const string command = "curl -s -X POST \"http://localhost:11434/api/chat\" "
        "-H \"Content-Type: application/json\" -d @ollama_payload.json";
#ifdef _WIN32
    FILE* pipe = _popen(command.c_str(), "r");
#else
    FILE* pipe = popen(command.c_str(), "r");
#endif
    if (!pipe) {
        remove("ollama_payload.json");
        return "[OFFLINE] Local Ollama AI server is not running. Please start Ollama on your PC and try again.";
    }

    string response;
    char buffer[4096];
    while (fgets(buffer, sizeof(buffer), pipe)) {
        response += buffer;
    }
#ifdef _WIN32
    const int curlStatus = _pclose(pipe);
#else
    const int curlStatus = pclose(pipe);
#endif
    remove("ollama_payload.json");
    if (curlStatus != 0 || response.empty()) {
        return "[OFFLINE] Local Ollama AI server is not running. Please start Ollama on your PC and try again.";
    }

    const size_t messageKey = response.find("\"message\"");
    const size_t messageStart = messageKey == string::npos
        ? string::npos : response.find('{', messageKey + 9);
    if (messageStart == string::npos) {
        return "[ERROR] Unable to parse Ollama response.";
    }

    size_t messageEnd = string::npos;
    int objectDepth = 0;
    bool insideString = false;
    bool escapeNext = false;
    for (size_t i = messageStart; i < response.size(); ++i) {
        const char character = response[i];
        if (insideString) {
            if (escapeNext) escapeNext = false;
            else if (character == '\\') escapeNext = true;
            else if (character == '"') insideString = false;
            continue;
        }
        if (character == '"') insideString = true;
        else if (character == '{') ++objectDepth;
        else if (character == '}' && --objectDepth == 0) {
            messageEnd = i;
            break;
        }
    }
    if (messageEnd == string::npos) {
        return "[ERROR] Unable to parse Ollama response.";
    }

    size_t contentKey = response.find("\"content\"", messageStart + 1);
    while (contentKey != string::npos && contentKey < messageEnd) {
        size_t keyStart = contentKey;
        while (keyStart > messageStart
            && isspace(static_cast<unsigned char>(response[keyStart - 1]))) {
            --keyStart;
        }
        size_t valueStart = contentKey + 9;
        while (valueStart < messageEnd
            && isspace(static_cast<unsigned char>(response[valueStart]))) {
            ++valueStart;
        }
        if (keyStart > messageStart
            && (response[keyStart - 1] == '{' || response[keyStart - 1] == ',')
            && valueStart < messageEnd && response[valueStart] == ':') {
            ++valueStart;
            while (valueStart < messageEnd
                && isspace(static_cast<unsigned char>(response[valueStart]))) {
                ++valueStart;
            }
            if (valueStart < messageEnd && response[valueStart] == '"') {
                const string reply = decodeJsonString(response, valueStart + 1);
                size_t replyStart = 0;
                while (replyStart < reply.size()
                    && isspace(static_cast<unsigned char>(reply[replyStart]))) {
                    ++replyStart;
                }
                size_t replyEnd = reply.size();
                while (replyEnd > replyStart
                    && isspace(static_cast<unsigned char>(reply[replyEnd - 1]))) {
                    --replyEnd;
                }
                if (replyStart < replyEnd) {
                    return formatAiReplyForConsole(reply.substr(replyStart, replyEnd - replyStart));
                }
            }
        }
        contentKey = response.find("\"content\"", contentKey + 9);
    }

    return "[ERROR] Unable to parse Ollama response.";
}

#if defined(_WIN32) && defined(__MINGW32__)
struct MediNaAiAsyncRequest {
    vector<pair<string, string>> chatHistory;
    string response;
};

unsigned int __stdcall runMediNaAiAsyncRequest(void* context) {
    MediNaAiAsyncRequest* request = static_cast<MediNaAiAsyncRequest*>(context);
    request->response = askMediNaHealthAI(request->chatHistory);
    return 0;
}
#endif

void ensureAIChatHistoryDirectory() {
#ifdef _WIN32
    _mkdir("AI Chat History");
#else
    mkdir("AI Chat History", 0755);
#endif
}

string getChatSessionDateTime() {
    const time_t currentTime = time(0);
    tm* localTime = localtime(&currentTime);
    if (localTime == nullptr) return "";

    char buffer[32];
    if (strftime(buffer, sizeof(buffer), "%d-%m-%Y %I:%M %p", localTime) == 0) return "";
    return string(buffer);
}

string generateChatFilename() {
    ensureAIChatHistoryDirectory();
    const time_t currentTime = time(0);
    tm* localTime = localtime(&currentTime);
    if (localTime == nullptr) return "AI Chat History/Chat.txt";

    char buffer[64];
    strftime(buffer, sizeof(buffer), "Chat_%d-%m-%Y_%I-%M-%S_%p.txt", localTime);
    string filePath = "AI Chat History/" + string(buffer);
    int suffix = 1;
    while (ifstream(filePath).good()) {
        char baseBuffer[64];
        strftime(baseBuffer, sizeof(baseBuffer), "Chat_%d-%m-%Y_%I-%M-%S_%p_", localTime);
        filePath = "AI Chat History/" + string(baseBuffer) + to_string(suffix++) + ".txt";
    }
    return filePath;
}

string sanitizeChatTitle(const string& message) {
    string title;
    for (char character : message) {
        if (character == '\r' || character == '\n' || character == '\t') title += ' ';
        else if (character == '"' || character == '\'') continue;
        else title += character;
    }
    size_t first = title.find_first_not_of(' ');
    if (first == string::npos) return "Untitled Chat";
    title.erase(0, first);
    size_t last = title.find_last_not_of(' ');
    if (last != string::npos) title.erase(last + 1);
    if (title.size() > 38) {
        size_t lastSpace = title.find_last_of(' ', 38);
        if (lastSpace != string::npos && lastSpace > 0) title.erase(lastSpace);
        else title = title.substr(0, 38);
    }
    return title;
}

string generateSmartChatTitle(const vector<pair<string, string>>& chatHistory) {
    string fallbackTitle;
    string firstUserMessage;
    for (const auto& turn : chatHistory) {
        if (turn.first != "USER") continue;
        if (firstUserMessage.empty()) firstUserMessage = turn.second;

        string normalized = turn.second;
        transform(normalized.begin(), normalized.end(), normalized.begin(), [](unsigned char character) {
            return static_cast<char>(tolower(character));
        });
        size_t first = normalized.find_first_not_of(" \t\r\n");
        if (first != string::npos) normalized.erase(0, first);
        size_t last = normalized.find_last_not_of(" \t\r\n");
        if (last != string::npos) normalized.erase(last + 1);

        const char punctuation[] = ".,!?;:\"'()[]{}";
        string greeting = normalized;
        size_t punctuationPosition = 0;
        while ((punctuationPosition = greeting.find_first_of(punctuation, punctuationPosition)) != string::npos) {
            greeting.erase(punctuationPosition, 1);
        }

        const string greetings[] = {
            "hi", "hello", "hey", "salam", "assalamu alaikum",
            "good morning", "how are you"
        };
        bool isGreeting = false;
        for (const string& greetingText : greetings) {
            if (greeting == greetingText) {
                isGreeting = true;
                break;
            }
        }
        if (!isGreeting) {
            fallbackTitle = sanitizeChatTitle(turn.second);
            break;
        }
    }
    if (fallbackTitle.empty()) {
        fallbackTitle = firstUserMessage.empty()
            ? "Untitled Chat" : sanitizeChatTitle(firstUserMessage);
    }

    if (!isOllamaServerOnline()) return fallbackTitle;

    ostringstream prompt;
    prompt << "Conversation:";
    size_t turnCount = 0;
    for (const auto& turn : chatHistory) {
        if (turnCount++ >= 12) break;
        prompt << "\n" << turn.first << ": " << turn.second.substr(0, 500);
    }

    ofstream payload("ollama_title_payload.json", ios::binary);
    if (!payload) return fallbackTitle;
    payload << "{\"model\":\"gemma3:4b\",\"stream\":false,"
            << "\"options\":{\"temperature\":0.3,\"num_predict\":25},"
            << "\"messages\":["
            << "{\"role\":\"system\",\"content\":\""
            << escapeJson("Generate a concise, meaningful 2 to 4 word title summarizing the main topic of this conversation. "
                          "Output ONLY the plain title words with no quotes, no punctuation, no markdown, and no extra text.")
            << "\"},"
            << "{\"role\":\"user\",\"content\":\"" << escapeJson(prompt.str()) << "\"}"
            << "]}";
    payload.close();
    if (!payload) {
        remove("ollama_title_payload.json");
        return fallbackTitle;
    }

    const string command = "curl -s -X POST \"http://localhost:11434/api/chat\" "
        "-H \"Content-Type: application/json\" -d @ollama_title_payload.json";
#ifdef _WIN32
    FILE* pipe = _popen(command.c_str(), "r");
#else
    FILE* pipe = popen(command.c_str(), "r");
#endif
    if (!pipe) {
        remove("ollama_title_payload.json");
        return fallbackTitle;
    }

    string response;
    char buffer[4096];
    while (fgets(buffer, sizeof(buffer), pipe)) response += buffer;
#ifdef _WIN32
    const int curlStatus = _pclose(pipe);
#else
    const int curlStatus = pclose(pipe);
#endif
    remove("ollama_title_payload.json");
    if (curlStatus != 0 || response.empty()) return fallbackTitle;

    size_t contentKey = response.find("\"content\"");
    if (contentKey == string::npos) return fallbackTitle;
    size_t valueStart = response.find('"', contentKey + 9);
    if (valueStart == string::npos) return fallbackTitle;
    string modelTitle = decodeJsonString(response, valueStart + 1);

    string sanitized;
    istringstream words(sanitizeChatTitle(modelTitle));
    string word;
    size_t wordCount = 0;
    while (words >> word && wordCount < 4) {
        string cleanWord;
        for (unsigned char character : word) {
            if (isalnum(character) || character >= 128) cleanWord += static_cast<char>(character);
        }
        if (!cleanWord.empty()) {
            if (wordCount > 0) sanitized += ' ';
            sanitized += cleanWord;
            ++wordCount;
        }
    }
    if (wordCount >= 2 && wordCount <= 4) return sanitized;
    return fallbackTitle;
}

string escapeChatMessage(const string& message) {
    string escaped;
    for (char character : message) {
        if (character == '\\') escaped += "\\\\";
        else if (character == '\n') escaped += "\\n";
        else if (character == '\r') escaped += "\\r";
        else if (character == '|') escaped += "\\|";
        else escaped += character;
    }
    return escaped;
}

string unescapeChatMessage(const string& escaped) {
    string message;
    for (size_t i = 0; i < escaped.size(); ++i) {
        if (escaped[i] == '\\' && i + 1 < escaped.size()) {
            const char next = escaped[i + 1];
            if (next == 'n') message += '\n';
            else if (next == 'r') message += '\r';
            else if (next == '|') message += '|';
            else if (next == '\\') message += '\\';
            else message += next;
            ++i;
        } else {
            message += escaped[i];
        }
    }
    return message;
}

void saveChatSessionToFile(const string& filePath, const string& title,
                           const string& sessionDateTime,
                           const vector<pair<string, string>>& chatHistory,
                           const vector<string>& chatTimestamps) {
    if (chatHistory.empty()) return;
    ensureAIChatHistoryDirectory();

    ofstream chatFile(filePath, ios::trunc);
    if (!chatFile) return;
    chatFile << "TITLE: " << sanitizeChatTitle(title) << '\n';
    chatFile << "DATETIME: " << sessionDateTime << '\n';
    for (size_t i = 0; i < chatHistory.size(); ++i) {
        const string timestamp = i < chatTimestamps.size() ? chatTimestamps[i] : "";
        chatFile << "TURN|" << chatHistory[i].first << "|" << timestamp << "|"
                 << escapeChatMessage(chatHistory[i].second) << '\n';
    }
}

void mediNaAiAssistantPortal() {
    cin.ignore(numeric_limits<streamsize>::max(), '\n');

    const size_t consoleWidth = 80;
    const size_t contentWidth = 54;

    auto utf8CharacterLength = [](const string& text, size_t position) {
        const unsigned char lead = static_cast<unsigned char>(text[position]);
        size_t length = 1;
        if (lead >= 0xc2 && lead <= 0xdf) length = 2;
        else if (lead >= 0xe0 && lead <= 0xef) length = 3;
        else if (lead >= 0xf0 && lead <= 0xf4) length = 4;

        if (position + length > text.size()) return static_cast<size_t>(1);
        for (size_t i = 1; i < length; ++i) {
            if ((static_cast<unsigned char>(text[position + i]) & 0xc0) != 0x80) {
                return static_cast<size_t>(1);
            }
        }
        return length;
    };

    auto countUtf8Characters = [&](const string& text) {
        size_t count = 0;
        for (size_t position = 0; position < text.size();) {
            position += utf8CharacterLength(text, position);
            ++count;
        }
        return count;
    };

    auto wrapMessage = [&](const string& message) {
        string cleanMessage;
        for (size_t i = 0; i < message.size();) {
            if (message[i] == '*' && i + 1 < message.size() && message[i + 1] == '*') {
                i += 2;
            } else {
                cleanMessage += message[i++];
            }
        }

        vector<string> lines;
        auto appendWrappedLine = [&](const string& sourceLine) {
            istringstream words(sourceLine);
            string word;
            string line;
            size_t lineCharacters = 0;
            bool hasWords = false;

            while (words >> word) {
                hasWords = true;
                size_t wordCharacters = countUtf8Characters(word);
                while (wordCharacters > contentWidth) {
                    if (!line.empty()) {
                        lines.push_back(line);
                        line.clear();
                        lineCharacters = 0;
                    }

                    size_t chunkBytes = 0;
                    size_t chunkCharacters = 0;
                    while (chunkCharacters < contentWidth) {
                        chunkBytes += utf8CharacterLength(word, chunkBytes);
                        ++chunkCharacters;
                    }
                    lines.push_back(word.substr(0, chunkBytes));
                    word.erase(0, chunkBytes);
                    wordCharacters -= chunkCharacters;
                }

                if (line.empty()) {
                    line = word;
                    lineCharacters = wordCharacters;
                } else if (lineCharacters + 1 + wordCharacters <= contentWidth) {
                    line += " " + word;
                    lineCharacters += 1 + wordCharacters;
                } else {
                    lines.push_back(line);
                    line = word;
                    lineCharacters = wordCharacters;
                }
            }

            if (!line.empty()) {
                lines.push_back(line);
            } else if (!hasWords) {
                lines.push_back("");
            }
        };

        size_t lineStart = 0;
        while (lineStart <= cleanMessage.size()) {
            size_t lineEnd = cleanMessage.find('\n', lineStart);
            if (lineEnd == string::npos) lineEnd = cleanMessage.size();
            string sourceLine = cleanMessage.substr(lineStart, lineEnd - lineStart);
            if (!sourceLine.empty() && sourceLine[sourceLine.size() - 1] == '\r') {
                sourceLine.erase(sourceLine.size() - 1);
            }
            appendWrappedLine(sourceLine);
            if (lineEnd == cleanMessage.size()) break;
            lineStart = lineEnd + 1;
        }

        if (lines.empty()) {
            lines.push_back("");
        }
        return lines;
    };

    auto getChatTimestamp = []() {
        const time_t currentTime = time(0);
        tm* localTime = localtime(&currentTime);
        if (localTime == nullptr) {
            throw runtime_error("Unable to determine the current local time.");
        }

        char timeBuffer[16];
        if (strftime(timeBuffer, sizeof(timeBuffer), "%I:%M %p", localTime) == 0) {
            throw runtime_error("Unable to format the current local time.");
        }
        return string(timeBuffer);
    };

    auto writeTypedText = [&](const string& text) {
        for (size_t position = 0; position < text.size();) {
            const size_t characterLength = utf8CharacterLength(text, position);
            cout.write(text.data() + position, static_cast<streamsize>(characterLength));
            cout.flush();
#ifdef _WIN32
            Sleep(18);
#else
            usleep(18000);
#endif
            position += characterLength;
        }
    };

    auto runMessengerSession = [&](const string& filePath, string& title,
                                   const string& sessionDateTime,
                                   vector<pair<string, string>>& chatHistory,
                                   vector<string>& chatTimestamps) {
        bool serverOnline = isOllamaServerOnline();
        auto renderMessengerUI = [&](bool aiTyping, bool streamNewestReply) {
            clearScreen();
            cout << string(consoleWidth, '=') << "\n";
            cout << "  MediNa AI Health Assistant   "
                 << (serverOnline ? colorGreen("[ONLINE]") : colorRed("[OFFLINE]"))
                 << "            (Type '0' or 'exit' to leave)\n";
            cout << string(consoleWidth, '-') << "\n";
            cout << colorYellow("    Note: AI provides primary guidance only. Visit a hospital for emergencies.") << "\n";
            cout << string(consoleWidth, '=') << "\n";

            for (size_t i = 0; i < chatHistory.size(); ++i) {
                const bool isUser = chatHistory[i].first == "USER";
                const string label = isUser ? "You" : "MediNa AI";
                const string timestamp = i < chatTimestamps.size() ? chatTimestamps[i] : "";
                const size_t labelWidth = label.size() + 3 + timestamp.size();
                cout << string(isUser && labelWidth < consoleWidth ? consoleWidth - labelWidth : 0, ' ')
                     << (isUser ? colorGreen(label) : colorCyan(label))
                     << " | " << timestamp << "\n";

                vector<string> lines = wrapMessage(chatHistory[i].second);
                for (size_t lineIndex = 0; lineIndex < lines.size(); ++lineIndex) {
                    const size_t lineCharacters = countUtf8Characters(lines[lineIndex]);
                    const size_t leftPadding = isUser && lineCharacters < consoleWidth
                        ? consoleWidth - lineCharacters : 0;
                    cout << string(isUser ? leftPadding : 2, ' ');
                    if (streamNewestReply && !isUser && i + 1 == chatHistory.size()) {
                        writeTypedText(lines[lineIndex]);
                    } else {
                        cout << lines[lineIndex];
                    }
                    cout << "\n";
                }

                cout << "\n";
            }

            cout << string(consoleWidth, '-') << "\n";
            if (aiTyping) {
                cout << colorCyan("MediNa AI is thinking | .") << flush;
            } else {
                cout << "Message > " << flush;
            }
        };

        string userQuery;
        renderMessengerUI(false, false);
        while (getline(cin, userQuery)) {
            if (userQuery == "0" || userQuery == "exit") break;

            serverOnline = isOllamaServerOnline();
            chatHistory.push_back(make_pair("USER", userQuery));
            chatTimestamps.push_back(getChatTimestamp());
            string response;
            if (!serverOnline) {
                response = "[OFFLINE] Local Ollama AI server is not running. Please start Ollama on your PC and try again.";
            } else {
                renderMessengerUI(true, false);

                const string spinnerFrames[] = {"| .", "/ ..", "- ...", "\\ ."};
                size_t spinnerFrame = 0;
                auto updateSpinner = [&]() {
                    spinnerFrame = (spinnerFrame + 1) % 4;
                    cout << '\r' << colorCyan("MediNa AI is thinking " + spinnerFrames[spinnerFrame])
                         << string(5 - spinnerFrames[spinnerFrame].size(), ' ') << flush;
                };
#if defined(_WIN32) && defined(__MINGW32__)
                MediNaAiAsyncRequest asyncRequest;
                asyncRequest.chatHistory = chatHistory;
                HANDLE requestThread = reinterpret_cast<HANDLE>(
                    _beginthreadex(nullptr, 0, runMediNaAiAsyncRequest, &asyncRequest, 0, nullptr));
                if (requestThread == nullptr) {
                    response = "[OFFLINE] Local Ollama AI server is not running. Please start Ollama on your PC and try again.";
                } else {
                    DWORD waitResult;
                    do {
                        waitResult = WaitForSingleObject(requestThread, 150);
                        if (waitResult == WAIT_TIMEOUT) updateSpinner();
                    } while (waitResult == WAIT_TIMEOUT);
                    if (waitResult != WAIT_OBJECT_0) {
                        WaitForSingleObject(requestThread, INFINITE);
                    }
                    response = asyncRequest.response;
                    CloseHandle(requestThread);
                }
#else
                std::future<string> responseFuture = std::async(std::launch::async, [chatHistory]() {
                    return askMediNaHealthAI(chatHistory);
                });
                while (responseFuture.wait_for(chrono::milliseconds(150)) != future_status::ready) {
                    updateSpinner();
                }
                response = responseFuture.get();
#endif
                if (response == "[OFFLINE] Local Ollama AI server is not running. Please start Ollama on your PC and try again.") {
                    serverOnline = false;
                }
            }
            chatHistory.push_back(make_pair("AI", response));
            chatTimestamps.push_back(getChatTimestamp());
            saveChatSessionToFile(filePath, title, sessionDateTime, chatHistory, chatTimestamps);
            renderMessengerUI(false, true);
        }
        if (!chatHistory.empty()) {
            cout << colorCyan("\nSaving chat summary...") << flush;
            title = generateSmartChatTitle(chatHistory);
            saveChatSessionToFile(filePath, title, sessionDateTime, chatHistory, chatTimestamps);
        }
    };

    ensureAIChatHistoryDirectory();
    while (true) {
        clearScreen();
        cout << "\n>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n";
        cout << colorCyan("      MEDINA AI HEALTH ASSISTANT HUB        ") << "\n";
        cout << "---------------------------------------------\n";
        cout << "1. New Chat\n";
        cout << "2. Chat History\n";
        cout << "0. Back to Main Menu\n";
        cout << "Enter Choice (0-2): ";

        string choiceLine;
        getline(cin, choiceLine);
        int choice = -1;
        try {
            choice = stoi(choiceLine);
        } catch (...) {
            choice = -1;
        }

        if (choice == 0) break;
        if (choice == 1) {
            vector<pair<string, string>> chatHistory;
            vector<string> chatTimestamps;
            string title = "Untitled Chat";
            string sessionDateTime = getChatSessionDateTime();
            string filePath = generateChatFilename();
            runMessengerSession(filePath, title, sessionDateTime, chatHistory, chatTimestamps);
        } else if (choice == 2) {
            ensureAIChatHistoryDirectory();
            struct SavedChat {
                string path;
                string title;
                string dateTime;
            };
            vector<SavedChat> savedChats;
#ifdef _WIN32
            _finddata_t findData;
            intptr_t findHandle = _findfirst("AI Chat History/*.txt", &findData);
            if (findHandle != -1) {
                do {
                    string chatPath = "AI Chat History/" + string(findData.name);
                    ifstream chatFile(chatPath);
                    string title = "Untitled Chat";
                    string dateTime = "";
                    string line;
                    if (getline(chatFile, line) && line.rfind("TITLE: ", 0) == 0) {
                        title = line.substr(7);
                    }
                    if (getline(chatFile, line) && line.rfind("DATETIME: ", 0) == 0) {
                        dateTime = line.substr(10);
                    }
                    savedChats.push_back({chatPath, title, dateTime});
                } while (_findnext(findHandle, &findData) == 0);
                _findclose(findHandle);
            }
#else
            DIR* directory = opendir("AI Chat History");
            if (directory != nullptr) {
                dirent* entry;
                while ((entry = readdir(directory)) != nullptr) {
                    string name = entry->d_name;
                    if (name.size() < 4 || name.substr(name.size() - 4) != ".txt") continue;
                    string chatPath = "AI Chat History/" + name;
                    ifstream chatFile(chatPath);
                    string title = "Untitled Chat";
                    string dateTime = "";
                    string line;
                    if (getline(chatFile, line) && line.rfind("TITLE: ", 0) == 0) {
                        title = line.substr(7);
                    }
                    if (getline(chatFile, line) && line.rfind("DATETIME: ", 0) == 0) {
                        dateTime = line.substr(10);
                    }
                    savedChats.push_back({chatPath, title, dateTime});
                }
                closedir(directory);
            }
#endif
            sort(savedChats.begin(), savedChats.end(), [](const SavedChat& a, const SavedChat& b) {
                return a.path > b.path;
            });

            while (true) {
                clearScreen();
                cout << "\n" << string(25, ' ') << colorCyan("--- SAVED AI CHAT HISTORY ---") << "\n";
                cout << "--------------------------------------------------------------------------------\n";
                for (size_t i = 0; i < savedChats.size(); ++i) {
                    string displayTitle = savedChats[i].title;
                    if (displayTitle.size() > 38) {
                        size_t lastSpace = displayTitle.find_last_of(' ', 38);
                        if (lastSpace != string::npos && lastSpace > 0) displayTitle.erase(lastSpace);
                        else displayTitle = displayTitle.substr(0, 38);
                    }
                    cout << left << setw(5) << (to_string(i + 1) + ".")
                         << left << setw(44) << displayTitle
                         << savedChats[i].dateTime << "\n";
                }
                cout << "--------------------------------------------------------------------------------\n";
                cout << "0. Back\n";
                cout << "Enter Chat Number to Open (0 to Back): ";

                string selectionLine;
                getline(cin, selectionLine);
                int selection = -1;
                try {
                    selection = stoi(selectionLine);
                } catch (...) {
                    selection = -1;
                }
                if (selection == 0) break;
                if (selection > 0 && static_cast<size_t>(selection) <= savedChats.size()) {
                    vector<pair<string, string>> chatHistory;
                    vector<string> chatTimestamps;
                    ifstream chatFile(savedChats[selection - 1].path);
                    string line;
                    string title = savedChats[selection - 1].title;
                    string dateTime = savedChats[selection - 1].dateTime;
                    if (getline(chatFile, line) && line.rfind("TITLE: ", 0) == 0) title = line.substr(7);
                    if (getline(chatFile, line) && line.rfind("DATETIME: ", 0) == 0) dateTime = line.substr(10);
                    while (getline(chatFile, line)) {
                        if (line.rfind("TURN|", 0) != 0) continue;
                        size_t roleEnd = line.find('|', 5);
                        if (roleEnd == string::npos) continue;
                        size_t timestampEnd = line.find('|', roleEnd + 1);
                        if (timestampEnd == string::npos) continue;
                        string role = line.substr(5, roleEnd - 5);
                        string timestamp = line.substr(roleEnd + 1, timestampEnd - roleEnd - 1);
                        string message = unescapeChatMessage(line.substr(timestampEnd + 1));
                        chatHistory.push_back(make_pair(role, message));
                        chatTimestamps.push_back(timestamp);
                    }
                    runMessengerSession(savedChats[selection - 1].path, title,
                                        dateTime, chatHistory, chatTimestamps);
                } else {
                    cout << colorRed("\n[ERROR] Invalid selection!\n");
                    pauseScreen();
                }
            }
        } else {
            cout << colorRed("\n[ERROR] Invalid Input!\n");
            pauseScreen();
        }
    }
}

int getSafeInt() {
    int value;
    while (!(cin >> value)) {
        cin.clear();
        cin.ignore(numeric_limits<streamsize>::max(), '\n');
        cout << colorRed("[ERROR] Invalid input! Please enter a valid number: ");
    }
    return value;
}


/*
//        06 October, 2026
//        sob kichur structure define kora hoiche ageee
*/



// joto user id, pass ache tar jonno ei structure 

struct User {
    string username;
    string password;    
    string role;        // amra duita role niye kaj kortechi (Company & Pharmacy)
    string entityId;    // Company ar Pharmacy er ID er jonno 
    string entityName;  // Company r Pharmacy naam show koranur jonno 
};


// Pharmacy er staff er jonno ei structure

struct Employee {
    string name;
    string gender;
    int age;
    string role;         // apatoto 3 ta role niye kaj korbo (Salesman, Pharmacist, Assistant)
};


// Pharmacy er details er jonno ei structure

struct PharmacyDetails {
    string pharmacyId;
    string pharmacyName;
    string ownerName;
    string fullAddress;      
    string areaLocation;     
    string contactNumber;    
    string googleMapsUrl;
    vector<Employee> staffList;      // vecot er kaj hoilo memory te extra jayga na neya
};


// Production er jonno ei structure

struct ProductionRecord {
    string batchNumber;
    string companyName;
    string drugGroup;
    int totalQuantity;  // Quantity bolte buzhanu hocche je ki poriman product banano hoiche
    double unitPrice;   // Per piece price
    string prodDate;    // DD-MM-YYYY -> eita amra <ctime> diye auto generate korbo, if possible
    string expDate;     // DD-MM-YYYY 
};
// Jodi somvob hoy tahole amra porer update a emon korbo jeno company admin caileo ager
// kuno date input diye na pare

// expiray date jeno production date er age dite na pare tar bebostao korbo porer update a




// Supply er jonno ei structure

struct SupplyRecord {
    string supplyId;    // S01A, S04B
    string batchNumber;
    string pharmacyId;
    int quantity;
    string supplyDate;  // supply date auto generate korbo, <ctime> use kore
};

struct SalesRecord {
    string salesId;
    string batchNumber;
    string pharmacyId;
    int soldQuantity;
    double totalPrice;  
};



// prothom dike chilo na, notun update a complaint er jonno ei structure add kora hoiche

struct Complaint {
    string complaintId;
    string pharmacyId;
    string customerName;
    string customerContact;
    string issueType;
    string description;
    string date;
    string status;
    string adminRemarks;
};



//    In-Memory Database er jonno vector use kora hoiche
//    we are usign .csv files to store data


vector<User> allUsers;
vector<PharmacyDetails> pharmacyInfoDatabase; 
vector<ProductionRecord> productionDatabase;   
vector<SupplyRecord> supplyDatabase;           
vector<SalesRecord> salesDatabase;             
vector<Complaint> complaintDatabase;

User currentUser;
bool isLoggedIn = false;


// Apatoto 4 ta drug group niye kaj korbo, jodi porer update a aro 
// add korte hoy tahole easily add kora jabe

const string DRUG_GROUPS[4] = {"Antibiotics", "Painkillers", "Antacids", "Paracetamol"};



// New update a ei encription system ta add kora hoiche 
// Ei function gula sob password er jonno use kora hoiche
// jeno password ta encrypt hoye thake  
// Ai er help niye bananu hoiche

string encryptDecrypt(const string& input) {
    char key = 'K'; 
    string output = input;
    for (size_t i = 0; i < input.size(); i++) {
        output[i] = input[i] ^ key;
    }
    return output;
}

string encodePassword(const string& password) {
    const string hexDigits = "0123456789ABCDEF";
    string encrypted = encryptDecrypt(password);
    string encoded = "HEX:";
    for (unsigned char character : encrypted) {
        encoded += hexDigits[character >> 4];
        encoded += hexDigits[character & 0x0F];
    }
    return encoded;
}

string decodePassword(const string& storedPassword) {
    const string prefix = "HEX:";
    if (storedPassword.compare(0, prefix.size(), prefix) != 0) {
        return encryptDecrypt(storedPassword);
    }

    string encrypted;
    for (size_t i = prefix.size(); i + 1 < storedPassword.size(); i += 2) {
        int high = isdigit(storedPassword[i]) ? storedPassword[i] - '0' : toupper(storedPassword[i]) - 'A' + 10;
        int low = isdigit(storedPassword[i + 1]) ? storedPassword[i + 1] - '0' : toupper(storedPassword[i + 1]) - 'A' + 10;
        if (high < 0 || high > 15 || low < 0 || low > 15) return encryptDecrypt(storedPassword);
        encrypted += static_cast<char>((high << 4) | low);
    }
    if ((storedPassword.size() - prefix.size()) % 2 != 0) return encryptDecrypt(storedPassword);
    return encryptDecrypt(encrypted);
}


// .csv file use korar karone, first ber er moto program run korle comppany A er admin pannel a
// login korte somossa hoito, jeita kuno vabei fix kora jacchilo na,
// that's why amra Ai help niye ei problem ta fix korar jonno nicher function ta develop korechi

// ei function mainly detect kore je login er somoy kuno user id pass a kuno hidden character
// ba extra space ache kina, jodi thake tahole oigula fix kore

string trim(const string& str) {
    size_t first = str.find_first_not_of(" \t\n\r");
    if (string::npos == first) return "";
    size_t last = str.find_last_not_of(" \t\n\r");
    return str.substr(first, (last - first + 1));
}

bool isValidName(const string& name) {    // invalid entry dile login korte dibe na 
    if (name.empty()) return false;

    bool hasLetter = false;
    for (unsigned char character : name) {
        if (isalpha(character)) {
            hasLetter = true;
        } else if (character != ' ' && character != '.') {
            return false;
        }
    }
    return hasLetter;
}


// +880 age thekei deya thakbe to sei hisebe just baki 10 ta digit input dibe
// complain a customer er contact number 10 digit er kina 
// check korar jonno ei function ta use kora hoiche

bool isValidBD10Digits(const string& userDigits) {
    if (userDigits.length() != 10) return false;
    for (unsigned char character : userDigits) {
        if (!isdigit(character)) return false;
    }
    return true;
}


// digit er jaygay onno kichu input dile auto block kore dibe 
// full system a DD-MM-YYYY er bahire onno formate use korte parbe na 

bool isValidDateFormat(const string& date) {
    if (date.length() != 10 || date[2] != '-' || date[5] != '-') return false;

    for (size_t i = 0; i < date.length(); ++i) {
        if (i != 2 && i != 5 && !isdigit(static_cast<unsigned char>(date[i]))) {
            return false;
        }
    }

    int day = stoi(date.substr(0, 2));
    int month = stoi(date.substr(3, 2));
    int year = stoi(date.substr(6, 4));
    if (year < 1 || month < 1 || month > 12) return false;

    const int daysInMonth[12] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
    int maxDay = daysInMonth[month - 1];
    bool isLeapYear = (year % 400 == 0) || (year % 4 == 0 && year % 100 != 0);
    if (month == 2 && isLeapYear) maxDay = 29;

    return day >= 1 && day <= maxDay;
}



// .csv file er joto kaj kam ache sob ei duita function a


// .csv file theke data read korar jonno ei function ta use kora hoiche 
// ei function er main kaj hoilo .csv file gular prottek ta line theke comma gula 
// detect kore oi line ta ke alada alada string a convert kore vector a store kora
vector<string> parseCSVLine(const string& line) {
    vector<string> result;
    string token;                               // comma gula te token generate kore
    bool inQuotes = false;        // inQuotes diye check kore comma "" er vitore na bahire
    // jodi comma "" er vitore thake tahole oigula ignore kore, then ++i diye porer ta abar check kore

    for (size_t i = 0; i < line.size(); ++i) {
        char character = line[i];
        if (character == '"') {
            if (inQuotes && i + 1 < line.size() && line[i + 1] == '"') {
                token += '"';
                ++i;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (character == ',' && !inQuotes) {
            result.push_back(trim(token));
            token.clear();
        } else {
            token += character;
        }
    }
    result.push_back(trim(token));
    return result;
}


// ei function er main kaj .csv file a dara write/store korar somoy file er 
// structure a jeno kuno problem na hoy sei dike kheal rakha 

string escapeCSVField(const string& field) {
    if (field.find_first_of(",\"\r\n") == string::npos) return field;
    // ei khane check kore file kuno comma, double quote, new line ache kina
    // jodi na thake tahole tahole oi gula jemon ache temon ei direct return kore
    // jodi thake tahole oigula ke escape kore
    // escape mane hoilo double quote diye data gular formation thik rakha

    // formation thik rakhar jonno nicher moto kaj kora hoiche
    string escaped = "\"";
    for (char character : field) {
        if (character == '"') escaped += "\"\"";
        else escaped += character;
    }
    return escaped + "\"";
}



// 2nd update a ei function ta add kora hoiche
// Ai er help niye ei sob ta kora hoiche 

// ei function er kaj hoilo current date ke numeric format a convert kora
// jemon 06-10-2026 ke 20261006 a convert kora
int getCurrentDateNumeric() {
    time_t t = time(0); // pc current time seconds hisebe niye ase
    tm* now = localtime(&t);  // oi seconds ke DD MM YYYY a convert kore
    int year = now->tm_year + 1900; // 1900 theke koto boro ta bahir kore, tai 1900 jur kore correct korchi
    int month = now->tm_mon + 1; // 0 theke 11 porjonto thake, tai 1 jur kore correct korchi mane 1 theke 12
    int day = now->tm_mday; // 1 theke 31 porjonto thake, tai direct use kora jabe
    return year * 10000 + month * 100 + day; // final numeric format a convert kore return korchi
}


// ei function er kaj hoilo current date ke string format a convert kora
// jeno manuser pokkhe read kora easy hoy

string getCurrentDateString() {
    time_t currentTime = time(0);
    tm* localTime = localtime(&currentTime);
    if (localTime == nullptr) {   // jodi local device theke time nite zhamela hoy tahole error dekhabe
        throw runtime_error("Unable to determine the current local date.");
    }  // mane error throw kore

    char dateBuffer[11];   // date rakhar jonno 11 size er ekta character arry banay
    if (strftime(dateBuffer, sizeof(dateBuffer), "%d-%m-%Y", localTime) == 0) {
        throw runtime_error("Unable to format the current date.");
    } // time ke sundor kore DD-MM-YYYY format a convert kore dateBuffer a store kore

    return string(dateBuffer);
    // character array ke string a convert kore return kore
}

string getCurrentDateTimeString() {
    time_t currentTime = time(0);
    tm* localTime = localtime(&currentTime);
    if (localTime == nullptr) {
        throw runtime_error("Unable to determine the current local date and time.");
    }

    char dateTimeBuffer[20];
    if (strftime(dateTimeBuffer, sizeof(dateTimeBuffer), "%d-%m-%Y %I:%M %p", localTime) == 0) {
        throw runtime_error("Unable to format the current date and time.");
    }

    return string(dateTimeBuffer);
}


// DD-MM-YYYY tarikh ke YYYYMMDD songkhay convert kore

int parseDateToNumeric(const string& dateStr) {
    if (dateStr.length() != 10) return 0;
    try {
        int day = stoi(dateStr.substr(0, 2));
        int month = stoi(dateStr.substr(3, 2));
        int year = stoi(dateStr.substr(6, 4));
        return year * 10000 + month * 100 + day;
    } catch (...) {
        return 0;
    }
}


// expairy date shesh kina ta check kore

bool isExpired(const string& expDateStr) {
    int expNum = parseDateToNumeric(expDateStr);
    int currentNum = getCurrentDateNumeric();
    return currentNum > expNum;
}

// Forward Declaration
void saveDataToFiles();

string generateNextSalesId(const string& pharmacyId) {
    int highestSalesNumber = 0;
    for (const auto& sale : salesDatabase) {
        if (sale.pharmacyId != pharmacyId || sale.salesId.compare(0, 2, "SL") != 0) continue;

        string numberPart = sale.salesId.substr(2);
        if (numberPart.empty()) continue;

        int salesNumber = 0;
        bool validNumber = true;
        for (char character : numberPart) {
            if (!isdigit(static_cast<unsigned char>(character))) {
                validNumber = false;
                break;
            }
            int digit = character - '0';
            if (salesNumber > (numeric_limits<int>::max() - digit) / 10) {
                validNumber = false;
                break;
            }
            salesNumber = salesNumber * 10 + digit;
        }
        if (validNumber && salesNumber > highestSalesNumber) highestSalesNumber = salesNumber;
    }

    ostringstream salesId;
    salesId << "SL" << setw(2) << setfill('0') << (highestSalesNumber + 1);
    return salesId.str();
}

// file handeling er jonno ei function ta use kora hoiche
// .csv file theke sob data load kore vector a store korar jonno ei function ta use kora hoiche

void loadDataFromFiles() {
    allUsers.clear();
    bool needsUserSave = false;
    
    
    // file theke user load korar jonno ei function ta use kora hoiche
    ifstream userFile("users.csv");
    if (userFile.is_open()) {
        string line;
        while (getline(userFile, line)) {
            line = trim(line);
            if (line.empty()) continue;
            auto tokens = parseCSVLine(line);
            if (tokens.size() >= 5) {
                allUsers.push_back({tokens[0], decodePassword(tokens[1]), tokens[2], tokens[3], tokens[4]});
            }
        }
        userFile.close();
    }

    // default user khali thakle ei gula use kore
    if (allUsers.empty()) {
        allUsers.push_back({"compA_admin", "compA123", "COMPANY", "1", "Company A"});
        allUsers.push_back({"compB_admin", "compB123", "COMPANY", "2", "Company B"});
        allUsers.push_back({"dsc_01", "dsc123", "PHARMACY", "DSC_01", "Jomuna'r Begum Pharmacy"});
        allUsers.push_back({"dsc_02", "dsc123", "PHARMACY", "DSC_02", "PinkySmart Pharmacy"});
        allUsers.push_back({"dsc_03", "dsc123", "PHARMACY", "DSC_03", "Dadar Pharmacy"});
        allUsers.push_back({"mir_01", "mirpur123", "PHARMACY", "MIR_01", "Drugs Int Pharmacy"});
        allUsers.push_back({"mir_02", "mirpur123", "PHARMACY", "MIR_02", "AKS Pharmacy"});
        allUsers.push_back({"mir_03", "mirpur123", "PHARMACY", "MIR_03", "Lazz Pharma"});
        allUsers.push_back({"utt_01", "uttara123", "PHARMACY", "UTT_01", "Health Care Pharmacy"});
        allUsers.push_back({"utt_02", "uttara123", "PHARMACY", "UTT_02", "Tamanna Pharmacy"});
        allUsers.push_back({"utt_03", "uttara123", "PHARMACY", "UTT_03", "New Root Pharmacy"});
        needsUserSave = true;
    }

    bool hasCompanyAAdmin = false;
    for (const auto& user : allUsers) {
        if (user.username == "compA_admin") {
            hasCompanyAAdmin = true;
            break;
        }
    }
    if (!hasCompanyAAdmin) {
        allUsers.push_back({"compA_admin", "compA123", "COMPANY", "1", "Company A"});
        needsUserSave = true;
    }

    bool hasRegulatoryAuthorityAdmin = false;
    for (const auto& user : allUsers) {
        if (user.username == "dgda_admin" && user.password == "dgda123" &&
            user.role == "REGULATOR" && user.entityId == "REG_01" &&
            user.entityName == "DGDA Regulatory Authority") {
            hasRegulatoryAuthorityAdmin = true;
            break;
        }
    }
    if (!hasRegulatoryAuthorityAdmin) {
        allUsers.push_back({"dgda_admin", "dgda123", "REGULATOR", "REG_01", "DGDA Regulatory Authority"});
        needsUserSave = true;
    }

    
    vector<PharmacyDetails> defaultPharmacies;
    defaultPharmacies.push_back({
        "DSC_01", "Jomuna'r Begum Pharmacy", "Sadia Afrin Proma", "Dattapara Central Mosque", "Daffodil", "01911111101",
        "https://maps.google.com/?q=23.8820,90.2670",
        {{"Rahim Uddin", "Male", 26, "Chief Pharmacist"}, {"Karim Hossain", "Male", 22, "Sales Assistant"}, {"Nusrat Jahan", "Female", 24, "Accountant"}}
    });
    defaultPharmacies.push_back({
        "DSC_02", "PinkySmart Pharmacy", "Masrour Zahan", "Dattapara Polli Biddut", "Daffodil", "01911111102",
        "https://maps.google.com/?q=23.8830,90.2680",
        {{"Tanvir Ahmed", "Male", 28, "Senior Pharmacist"}, {"Sabrina Yeasmin", "Female", 23, "Sales Executive"}}
    });
    defaultPharmacies.push_back({
        "DSC_03", "Dadar Pharmacy", "Mahir Ajmol", "YKSG-1 Boys Hall", "Daffodil", "01911111103",
        "https://maps.google.com/?q=23.8850,90.2700",
        {{"Mehedi Hasan", "Male", 25, "Store Manager"}}
    });
    defaultPharmacies.push_back({
        "MIR_01", "Drugs Int. Pharmacy", "Md. Abdur Rasid", "60 Feet Road", "Mirpur", "01722222201",
        "https://maps.google.com/?q=23.8069,90.3687",
        {{"Rafiqul Islam", "Male", 30, "Head Pharmacist"}, {"Sumaiya Akter", "Female", 22, "Counter Assistant"}}
    });
    defaultPharmacies.push_back({
        "MIR_02", "AKS Pharmacy", "Ahmed Khan", "Kaca Bazar Masjid Road", "Mirpur", "01722222202",
        "https://maps.google.com/?q=23.7950,90.3530",
        {{"Hasan Mahmud", "Male", 27, "Pharmacist"}}
    });
    defaultPharmacies.push_back({
        "MIR_03", "Lazz Pharma", "Shanta Mariam", "6/3A Kallayanpur", "Mirpur", "01722222203",
        "https://maps.google.com/?q=23.7800,90.3600",
        {{"Sabbir Rahman", "Male", 29, "Branch Manager"}}
    });
    defaultPharmacies.push_back({
        "UTT_01", "Health Care Pharmacy", "Rahman Mia", "Rajlokkhi Complex", "Uttara", "01833333301",
        "https://maps.google.com/?q=23.8759,90.3795",
        {{"Ayesha Siddiqua", "Female", 28, "Senior Pharmacist"}}
    });
    defaultPharmacies.push_back({
        "UTT_02", "Tamanna Pharmacy", "Radit Hossain", "Poncoboti Mur", "Uttara", "01833333302",
        "https://maps.google.com/?q=23.8720,90.3850",
        {{"Sohel Rana", "Male", 26, "Counter Salesman"}}
    });
    defaultPharmacies.push_back({
        "UTT_03", "New Root Pharmacy", "Ahmed Safi", "9B/6 Airport Railway Road", "Uttara", "01833333303",
        "https://maps.google.com/?q=23.8680,90.3900",
        {{"Shahidul Alam", "Male", 32, "Pharmacist Manager"}}
    });

    pharmacyInfoDatabase.clear();
    bool needsPharmacyEmployeeSave = false;
    ifstream pharmacyFile("pharmacies.csv");
    if (pharmacyFile.is_open()) {
        string line;
        while (getline(pharmacyFile, line)) {
            line = trim(line);
            if (line.empty()) continue;
            auto tokens = parseCSVLine(line);
            if (tokens.size() >= 7 && tokens[0] != "pharmacyId") {
                pharmacyInfoDatabase.push_back({
                    tokens[0], tokens[1], tokens[2], tokens[3], tokens[4], tokens[5], tokens[6], {}
                });
            }
        }
        pharmacyFile.close();
    }
    if (pharmacyInfoDatabase.empty()) {
        pharmacyInfoDatabase = defaultPharmacies;
        needsPharmacyEmployeeSave = true;
    }
    for (auto& pharmacy : pharmacyInfoDatabase) {
        pharmacy.staffList.clear();
    }

    ifstream employeeFile("employees.csv");
    size_t loadedEmployeeCount = 0;
    if (employeeFile.is_open()) {
        string line;
        while (getline(employeeFile, line)) {
            line = trim(line);
            if (line.empty()) continue;
            auto tokens = parseCSVLine(line);
            if (tokens.size() >= 5 && tokens[0] != "pharmacyId") {
                try {
                    int age = stoi(tokens[3]);
                    for (auto& pharmacy : pharmacyInfoDatabase) {
                        if (pharmacy.pharmacyId == tokens[0]) {
                            pharmacy.staffList.push_back({tokens[1], tokens[2], age, tokens[4]});
                            ++loadedEmployeeCount;
                            break;
                        }
                    }
                } catch (const exception&) {
                    continue;
                }
            }
        }
        employeeFile.close();
    }
    if (loadedEmployeeCount == 0) {
        for (auto& pharmacy : pharmacyInfoDatabase) {
            pharmacy.staffList.clear();
            for (const auto& defaultPharmacy : defaultPharmacies) {
                if (pharmacy.pharmacyId == defaultPharmacy.pharmacyId) {
                    pharmacy.staffList = defaultPharmacy.staffList;
                    break;
                }
            }
        }
        needsPharmacyEmployeeSave = true;
    }

    // production data load korar jonno 

    productionDatabase.clear();
    ifstream prodFile("production.csv");
    if (prodFile.is_open()) {
        string line;
        while (getline(prodFile, line)) {
            line = trim(line);
            if (line.empty()) continue;
            auto tokens = parseCSVLine(line);
            if (tokens.size() >= 7) {
                productionDatabase.push_back({tokens[0], tokens[1], tokens[2], stoi(tokens[3]), stod(tokens[4]), tokens[5], tokens[6]});
            }
        }
        prodFile.close();
    }

    // supply data load korar jonno 

    supplyDatabase.clear();
    ifstream supFile("supply.csv");
    if (supFile.is_open()) {
        string line;
        while (getline(supFile, line)) {
            line = trim(line);
            if (line.empty()) continue;
            auto tokens = parseCSVLine(line);
            if (tokens.size() >= 5) {
                supplyDatabase.push_back({tokens[0], tokens[1], tokens[2], stoi(tokens[3]), tokens[4]});
            }
        }
        supFile.close();
    }

    // sales data load korar jonno 

    salesDatabase.clear();
    bool needsSalesSave = false;
    ifstream saleFile("sales.csv");
    if (saleFile.is_open()) {
        string line;
        while (getline(saleFile, line)) {
            line = trim(line);
            if (line.empty()) continue;
            auto tokens = parseCSVLine(line);
            if (tokens.size() >= 5 && tokens[0] != "salesId") {
                salesDatabase.push_back({tokens[0], tokens[1], tokens[2], stoi(tokens[3]), stod(tokens[4])});
            } else if (tokens.size() >= 4 && tokens[0] != "batchNumber") {
                salesDatabase.push_back({
                    generateNextSalesId(tokens[1]), tokens[0], tokens[1], stoi(tokens[2]), stod(tokens[3])
                });
                needsSalesSave = true;
            }
        }
        saleFile.close();
    }

    complaintDatabase.clear();
    ifstream complaintFile("complaints.csv");
    if (complaintFile.is_open()) {
        string line;
        while (getline(complaintFile, line)) {
            line = trim(line);
            if (line.empty()) continue;
            auto tokens = parseCSVLine(line);
            if (tokens.size() >= 7 && tokens[0] != "complaintId") {
                complaintDatabase.push_back({
                    tokens[0], tokens[1], tokens[2], tokens[3], tokens[4], tokens[5], tokens[6],
                    tokens.size() >= 8 ? tokens[7] : "Pending",
                    tokens.size() >= 9 ? tokens[8] : "Under Review"
                });
            }
        }
        complaintFile.close();
    }

    if (needsUserSave || needsPharmacyEmployeeSave || needsSalesSave) saveDataToFiles();
}

void saveDataToFiles() {
    // user encrepted kore save kore rakhe 
    ofstream userFile("users.csv", ios::trunc);
    if (userFile.is_open()) {
        for (const auto& u : allUsers) {
            userFile << escapeCSVField(u.username) << "," << escapeCSVField(encodePassword(u.password)) << "," << escapeCSVField(u.role) << "," << escapeCSVField(u.entityId) << "," << escapeCSVField(u.entityName) << "\n";
        }
        userFile.close();
    }

    ofstream pharmacyFile("pharmacies.csv", ios::trunc);
    if (pharmacyFile.is_open()) {
        pharmacyFile << "pharmacyId,pharmacyName,ownerName,fullAddress,areaLocation,contactNumber,googleMapsUrl\n";
        for (const auto& pharmacy : pharmacyInfoDatabase) {
            pharmacyFile << escapeCSVField(pharmacy.pharmacyId) << ","
                         << escapeCSVField(pharmacy.pharmacyName) << ","
                         << escapeCSVField(pharmacy.ownerName) << ","
                         << escapeCSVField(pharmacy.fullAddress) << ","
                         << escapeCSVField(pharmacy.areaLocation) << ","
                         << escapeCSVField(pharmacy.contactNumber) << ","
                         << escapeCSVField(pharmacy.googleMapsUrl) << "\n";
        }
        pharmacyFile.close();
    }

    ofstream employeeFile("employees.csv", ios::trunc);
    if (employeeFile.is_open()) {
        employeeFile << "pharmacyId,name,gender,age,role\n";
        for (const auto& pharmacy : pharmacyInfoDatabase) {
            for (const auto& employee : pharmacy.staffList) {
                employeeFile << escapeCSVField(pharmacy.pharmacyId) << ","
                             << escapeCSVField(employee.name) << ","
                             << escapeCSVField(employee.gender) << ","
                             << employee.age << ","
                             << escapeCSVField(employee.role) << "\n";
            }
        }
        employeeFile.close();
    }

    ofstream prodFile("production.csv", ios::trunc);
    if (prodFile.is_open()) {
        for (const auto& p : productionDatabase) {
            prodFile << p.batchNumber << "," << p.companyName << "," << p.drugGroup << "," << p.totalQuantity << "," << p.unitPrice << "," << p.prodDate << "," << p.expDate << "\n";
        }
        prodFile.close();
    }

    ofstream supFile("supply.csv", ios::trunc);
    if (supFile.is_open()) {
        for (const auto& s : supplyDatabase) {
            supFile << s.supplyId << "," << s.batchNumber << "," << s.pharmacyId << "," << s.quantity << "," << s.supplyDate << "\n";
        }
        supFile.close();
    }

    ofstream saleFile("sales.csv", ios::trunc);
    if (saleFile.is_open()) {
        for (const auto& s : salesDatabase) {
            saleFile << s.salesId << "," << s.batchNumber << "," << s.pharmacyId << ","
                     << s.soldQuantity << "," << s.totalPrice << "\n";
        }
        saleFile.close();
    }

    ofstream complaintFile("complaints.csv", ios::trunc);
    if (complaintFile.is_open()) {
        complaintFile << "complaintId,pharmacyId,customerName,customerContact,issueType,description,date,status,adminRemarks\n";
        for (const auto& complaint : complaintDatabase) {
            complaintFile << escapeCSVField(complaint.complaintId) << ","
                          << escapeCSVField(complaint.pharmacyId) << ","
                          << escapeCSVField(complaint.customerName) << ","
                          << escapeCSVField(complaint.customerContact) << ","
                          << escapeCSVField(complaint.issueType) << ","
                          << escapeCSVField(complaint.description) << ","
                          << escapeCSVField(complaint.date) << ","
                          << escapeCSVField(complaint.status) << ","
                          << escapeCSVField(complaint.adminRemarks) << "\n";
        }
        complaintFile.close();
    }
}

// ei sob helper function

int getCompanyProductionCount(const string& compName) {
    int count = 0;
    for (const auto& p : productionDatabase) {
        if (p.companyName == compName) count++;
    }
    return count;
}

int getCompanySupplyCount(const string& compName) {
    int count = 0;
    for (const auto& s : supplyDatabase) {
        for (const auto& p : productionDatabase) {
            if (p.batchNumber == s.batchNumber && p.companyName == compName) {
                count++;
                break;
            }
        }
    }
    return count;
}

int getTotalSuppliedByBatch(string batch) {
    int total = 0;
    for (size_t i = 0; i < supplyDatabase.size(); i++) {
        if (supplyDatabase[i].batchNumber == batch) total += supplyDatabase[i].quantity;
    }
    return total;
}

int getTotalSuppliedToPharmacy(string batch, string pharmacyId) {
    int total = 0;
    for (size_t i = 0; i < supplyDatabase.size(); i++) {
        if (supplyDatabase[i].batchNumber == batch && supplyDatabase[i].pharmacyId == pharmacyId) {
            total += supplyDatabase[i].quantity;
        }
    }
    return total;
}

int getTotalSoldByPharmacy(string batch, string pharmacyId) {
    int total = 0;
    for (size_t i = 0; i < salesDatabase.size(); i++) {
        if (salesDatabase[i].batchNumber == batch && salesDatabase[i].pharmacyId == pharmacyId) {
            total += salesDatabase[i].soldQuantity;
        }
    }
    return total;
}

double getUnitPriceForBatch(string batch) {
    for (size_t i = 0; i < productionDatabase.size(); i++) {
        if (productionDatabase[i].batchNumber == batch) return productionDatabase[i].unitPrice;
    }
    return 0.0;
}

string extractMMYYFromDate(const string& dateStr) {
    if (dateStr.length() == 10 && dateStr[2] == '-' && dateStr[5] == '-') {
        string month = dateStr.substr(3, 2);
        string yearLastTwo = dateStr.substr(8, 2);
        return month + yearLastTwo;
    }
    return "0000"; 
}

void printPharmacyProfile(const PharmacyDetails& pharm) {
    cout << ">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n";
    cout << " Pharmacy ID      : " << pharm.pharmacyId << "\n";
    cout << " Pharmacy Name    : " << pharm.pharmacyName << "\n";
    cout << " Owner Name       : " << pharm.ownerName << "\n";
    cout << " Address          : " << pharm.fullAddress << "\n";
    cout << " Area / Location  : " << pharm.areaLocation << "\n";
    cout << " Contact Number   : " << pharm.contactNumber << "\n";
    cout << " Google Maps Link : " << pharm.googleMapsUrl << "\n";
    cout << " Total Employees  : " << pharm.staffList.size() << " Person(s)\n";
    cout << "-----------------------------------------------------------------------\n";
    cout << colorCyan("                     EMPLOYEE / STAFF DETAILS                          ") << "\n";
    cout << "-----------------------------------------------------------------------\n";
    cout << left << setw(5) << "SL" << setw(20) << "NAME" << setw(10) << "GENDER" << setw(8) << "AGE" << "ROLE/DESIGNATION\n";
    cout << "-----------------------------------------------------------------------\n";
    
    int sl = 1;
    for (const auto& emp : pharm.staffList) {
        cout << left << setw(5) << sl++ << setw(20) << emp.name << setw(10) << emp.gender << setw(8) << emp.age << emp.role << "\n";
    }
    cout << "-----------------------------------------------------------------------\n";
}

// ইনভয়েস ফাইল জেনারেটর
void generatePrintedInvoice(string pName, string batch, string groupName, int qty, double price, double total) {
    static int invoiceNo = 1001;
    string fileName = "Invoice_" + to_string(invoiceNo++) + ".txt";
    ofstream inv(fileName);
    if (inv.is_open()) {
        inv << ">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n";
        inv << "           MediNa-Pharmatrack               \n";
        inv << "---------------------------------------------\n";
        inv << " Pharmacy Name : " << pName << "\n";
        inv << " Batch Number  : " << batch << "\n";
        inv << " Group Name    : " << groupName << "\n";
        inv << " Quantity Sold : " << qty << " pcs\n";
        inv << " Unit Price    : " << fixed << setprecision(2) << price << " BDT\n";
        inv << " Total Bill    : " << total << " BDT\n";
        inv << "---------------------------------------------\n";
        inv << "     Thank you for your business!            \n";
        inv.close();
        cout << colorGreen(" [PRINT] Invoice receipt generated: " + fileName) << "\n";
    }
}

// customer portal

void findPharmaciesNearMe() {
    clearScreen();
    cout << "\n" << colorCyan("--- PHARMACY NEAR ME (SEARCH PORTAL) ---") << "\n\n";
    cout << "Available Areas:\n  1. Daffodil\n  2. Mirpur\n  3. Uttara\n  4. Show All\n  0. Back\nSelect Choice: ";

    int choice;
    choice = getSafeInt();
    if (choice == 0) return;
    if (choice < 1 || choice > 4) return;

    string areaTitle = (choice == 1) ? "Daffodil" : (choice == 2) ? "Mirpur" : (choice == 3) ? "Uttara" : "Show All";

    vector<PharmacyDetails> matchedPharmacies;
    for (const auto& pharm : pharmacyInfoDatabase) {
        if (choice == 4 || pharm.areaLocation == areaTitle) {
            matchedPharmacies.push_back(pharm);
        }
    }

    clearScreen();
    cout << "\n" << colorCyan("--- PHARMACY NEAR ME : " + areaTitle + " ---") << "\n\n";
    for (size_t i = 0; i < matchedPharmacies.size(); i++) {
        cout << i + 1 << ". " << matchedPharmacies[i].pharmacyName
             << " (" << matchedPharmacies[i].pharmacyId << ")\n";
    }
    cout << "0. Back\nEnter Pharmacy Number to View Full Details (0 to Back): ";

    int pharmChoice;
    pharmChoice = getSafeInt();
    if (pharmChoice == 0) return;
    if (pharmChoice < 1 || static_cast<size_t>(pharmChoice) > matchedPharmacies.size()) return;

    clearScreen();
    cout << "\n" << colorCyan("--- PHARMACY PROFILE & STAFF DETAILS (" + matchedPharmacies[pharmChoice - 1].pharmacyName + ") ---") << "\n\n";
    printPharmacyProfile(matchedPharmacies[pharmChoice - 1]);
}

void showPharmacyStaffInfo() {
    clearScreen();
    cout << colorCyan("\n--- PHARMACY PROFILE & STAFF DETAILS ---") << "\n";
    string pId;
    cout << "\nEnter Pharmacy ID to View Details (0 to Cancel): ";
    cin >> pId;
    if (pId == "0") return; 
    clearScreen();
    cout << "\n" << colorCyan("--- PHARMACY PROFILE & STAFF DETAILS ---") << "\n\n";

    bool found = false;
    for (const auto& pharm : pharmacyInfoDatabase) {
        if (pharm.pharmacyId == pId) {
            found = true;
            printPharmacyProfile(pharm);
            break;
        }
    }
    if (!found) cout << colorYellow("\n[INFO] Pharmacy ID not found.\n");
}

void verifyMedicineByBatch() {
    clearScreen();
    cout << colorCyan("\n--- VERIFY MEDICINE AUTHENTICITY & EXPIRY ---") << "\n";
    string pharmacyId, batch;
    cout << "\nSelect Target Pharmacy ID (0 to Cancel): ";
    cin >> pharmacyId;
    if (pharmacyId == "0") return; 

    cout << "Enter Medicine Batch Number (0 to Cancel): ";
    cin >> batch;
    if (batch == "0") return; 

    bool found = false;
    ProductionRecord matchedRecord;

    for (const auto& prod : productionDatabase) {
        if (prod.batchNumber == batch) {
            found = true;
            matchedRecord = prod;
            break;
        }
    }

    if (!found) {
        cout << colorRed("\n[ALERT / WARNING] Invalid Batch Number! The medicine is not genuine!") << "\n";
        return;
    }

    int received = getTotalSuppliedToPharmacy(batch, pharmacyId);
    int sold = getTotalSoldByPharmacy(batch, pharmacyId);
    int remainingStock = received - sold;

    cout << colorCyan("\n>>>>>>>>>>>>>>>> VERIFIED DRUG INFO <<<<<<<<<<<<<<<<") << "\n";
    if (isExpired(matchedRecord.expDate)) {
        cout << "Status         : " << colorRed("[EXPIRED MEDICINE - DO NOT BUY!]") << "\n";
    } else {
        cout << "Status         : " << colorGreen("[AUTHENTIC & VERIFIED MEDICINE]") << "\n";
    }
    cout << "Batch Number   : " << matchedRecord.batchNumber << "\n";
    cout << "Manufacturer   : " << matchedRecord.companyName << "\n";
    cout << "Drug Group     : " << matchedRecord.drugGroup << "\n";
    cout << "Unit Price     : " << fixed << setprecision(2) << matchedRecord.unitPrice << " BDT / pcs\n";
    cout << "Production Date: " << matchedRecord.prodDate << "\n";
    cout << "Expiry Date    : " << matchedRecord.expDate << "\n";
    cout << "----------------------------------------------------\n";
    cout << colorCyan("PHARMACY LIVE INVENTORY STATUS (Pharmacy ID: " + pharmacyId + "):") << "\n";
    cout << " -> Total Supplied to Store : " << received << " pcs\n";
    cout << " -> Total Sold by Store     : " << sold << " pcs\n";
    cout << " -> CURRENT REMAINING STOCK : >>> " << remainingStock << " pcs <<<\n";
    cout << "====================================================\n";
}

void searchMedicineByGroup() {
    clearScreen();
    cout << colorCyan("\n--- SEARCH MEDICINE STOCK BY GROUP ---") << "\n";
    cout << colorCyan("\nSelect Drug Group:") << "\n";
    for (int i = 0; i < 4; i++) cout << "  " << i + 1 << ". " << DRUG_GROUPS[i] << "\n";
    cout << "  0. Back\nEnter Choice: ";

    int groupChoice;
    groupChoice = getSafeInt();
    if (groupChoice < 1 || groupChoice > 4) return;

    string selectedGroup = DRUG_GROUPS[groupChoice - 1];
    cout << "\n---------------------------------------------------------------------------------------------------------\n";
    cout << left << setw(14) << "PHARMACY ID" << setw(24) << "PHARMACY NAME" << setw(26) << "BATCH NUMBER" << setw(18) << "COMPANY NAME" << setw(14) << "PRICE (BDT)" << "STOCK\n";
    cout << "---------------------------------------------------------------------------------------------------------\n";

    bool foundAny = false;
    vector<const PharmacyDetails*> pharmaciesWithStock;
    for (const auto& prod : productionDatabase) {
        if (prod.drugGroup == selectedGroup && !isExpired(prod.expDate)) {
            for (const auto& pharm : pharmacyInfoDatabase) {
                int rec = getTotalSuppliedToPharmacy(prod.batchNumber, pharm.pharmacyId);
                int sold = getTotalSoldByPharmacy(prod.batchNumber, pharm.pharmacyId);
                int avail = rec - sold;

                if (avail > 0) {
                    foundAny = true;
                    cout << left << setw(14) << pharm.pharmacyId << setw(24) << pharm.pharmacyName << setw(26) << prod.batchNumber << setw(18) << prod.companyName << setw(14) << fixed << setprecision(2) << prod.unitPrice << avail << " pcs\n";

                    bool alreadyAdded = false;
                    for (const auto* matchedPharmacy : pharmaciesWithStock) {
                        if (matchedPharmacy->pharmacyId == pharm.pharmacyId) {
                            alreadyAdded = true;
                            break;
                        }
                    }
                    if (!alreadyAdded) pharmaciesWithStock.push_back(&pharm);
                }
            }
        }
    }
    if (!foundAny) cout << colorYellow(" [INFO] No active stock available for this group.") << "\n";
    cout << "---------------------------------------------------------------------------------------------------------\n";

    if (foundAny) {
        char viewProfiles;
        cout << "Would you like to view profiles of pharmacies with this medicine? (Y/N): ";
        cin >> viewProfiles;
        if (toupper(static_cast<unsigned char>(viewProfiles)) == 'Y') {
            for (const auto* pharmacy : pharmaciesWithStock) {
                printPharmacyProfile(*pharmacy);
            }
        }
    }
}

void filePharmacyComplaint() {
    clearScreen();
    cout << colorCyan("\n--- FILE A COMPLAINT ---") << "\n";
    string pharmacyId;
    cout << "Enter Pharmacy ID: ";
    getline(cin >> ws, pharmacyId);
    pharmacyId = trim(pharmacyId);

    bool pharmacyExists = false;
    for (const auto& pharmacy : pharmacyInfoDatabase) {
        if (pharmacy.pharmacyId == pharmacyId) {
            pharmacyExists = true;
            break;
        }
    }
    if (!pharmacyExists) {
        cout << colorRed("\n[ERROR] Pharmacy ID not found.") << "\n";
        return;
    }

    Complaint newComplaint;
    newComplaint.pharmacyId = pharmacyId;
    newComplaint.status = "Pending";
    newComplaint.adminRemarks = "Under Review";

    int nextComplaintNumber = 1;
    bool complaintIdInUse = true;
    while (complaintIdInUse) {
        ostringstream complaintIdStream;
        complaintIdStream << "CPM" << setw(3) << setfill('0') << nextComplaintNumber;
        newComplaint.complaintId = complaintIdStream.str();

        complaintIdInUse = false;
        for (const auto& complaint : complaintDatabase) {
            if (complaint.complaintId == newComplaint.complaintId) {
                complaintIdInUse = true;
                ++nextComplaintNumber;
                break;
            }
        }
    }

    while (true) {
        cout << "Enter Your Name: ";
        getline(cin, newComplaint.customerName);
        newComplaint.customerName = trim(newComplaint.customerName);
        if (isValidName(newComplaint.customerName)) break;
        cout << colorRed("[ERROR] Name may contain only letters, spaces, and dots.") << "\n";
    }

    string userDigits;
    while (true) {
        cout << "Enter Your Contact Number: +880 ";
        getline(cin, userDigits);
        if (isValidBD10Digits(userDigits)) break;
        cout << colorRed("[ERROR] Enter exactly 10 digits without spaces or symbols.") << "\n";
    }
    newComplaint.customerContact = "+880" + userDigits;

    cout << colorCyan("\nSelect Complaint Type:") << "\n";
    cout << "1. Overpricing\n2. Expired Medicine\n3. Bad Behavior\n4. Fake Medicine\n5. Other\n";
    cout << "Enter Choice (1-5): ";
    int issueChoice;
    issueChoice = getSafeInt();
    if (issueChoice < 1 || issueChoice > 5) {
        cout << colorRed("\n[ERROR] Invalid complaint type.") << "\n";
        return;
    }
    const string issueTypes[5] = {
        "Overpricing", "Expired Medicine", "Bad Behavior", "Fake Medicine", "Other"
    };
    newComplaint.issueType = issueTypes[issueChoice - 1];

    cin.ignore(numeric_limits<streamsize>::max(), '\n');
    while (true) {
        cout << "Describe the issue (maximum 100 characters): ";
        getline(cin, newComplaint.description);
        if (newComplaint.description.length() > 100) {
            cout << colorRed("[ERROR] Description is " +
                to_string(newComplaint.description.length()) +
                " characters; maximum allowed is 100.") << "\n";
            continue;
        }
        newComplaint.description = trim(newComplaint.description);
        if (newComplaint.description.empty()) {
            cout << colorRed("[ERROR] Description cannot be empty.") << "\n";
            continue;
        }
        break;
    }

    newComplaint.date = getCurrentDateTimeString();
    cout << colorCyan("Complaint Date & Time: " + newComplaint.date) << "\n";

    complaintDatabase.push_back(newComplaint);
    saveDataToFiles();
    cout << colorGreen("\n[SUCCESS] Complaint " + newComplaint.complaintId +
        " filed and saved successfully.") << "\n";
}

string getComplaintStatusColor(const string& status) {
    if (status == "Resolved") return colorGreen(status);
    if (status == "Dismissed") return colorRed(status);
    return colorYellow(status);
}

void displayComplaintDetails(const Complaint& complaint) {
    cout << "Complaint ID     : " << complaint.complaintId << "\n";
    cout << "Pharmacy ID      : " << complaint.pharmacyId << "\n";
    for (const auto& pharmacy : pharmacyInfoDatabase) {
        if (pharmacy.pharmacyId == complaint.pharmacyId) {
            cout << "Pharmacy Name    : " << pharmacy.pharmacyName << "\n";
            break;
        }
    }
    cout << "Customer Name    : " << complaint.customerName << "\n";
    cout << "Customer Contact : " << complaint.customerContact << "\n";
    cout << "Issue Type       : " << complaint.issueType << "\n";
    cout << "Description      : " << complaint.description << "\n";
    cout << "Date             : " << complaint.date << "\n";
    cout << "Status           : " << getComplaintStatusColor(complaint.status) << "\n";
    cout << "Admin Remarks    : " << complaint.adminRemarks << "\n";
}

void trackComplaintStatus() {
    clearScreen();
    cout << colorCyan("\n--- TRACK COMPLAINT STATUS ---") << "\n";
    cout << "Enter Complaint ID (0 to Cancel): ";
    string complaintId;
    cin >> complaintId;
    if (complaintId == "0") return;
    complaintId = trim(complaintId);

    for (const auto& complaint : complaintDatabase) {
        if (complaint.complaintId == complaintId) {
            cout << "\n";
            displayComplaintDetails(complaint);
            return;
        }
    }
    cout << colorRed("\n[ERROR] Complaint ID not found.") << "\n";
}

void publicCustomerVerification() {
    while (true) {
        clearScreen();
        cout << "\n>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n";
        cout << colorCyan("     CUSTOMER PUBLIC INFORMATION PORTAL     ") << "\n";
        cout << "---------------------------------------------\n";
        cout << "1. Search Medicine Stock by Group\n2. Verify Medicine Authenticity & Expiry (By Batch)\n3. View Pharmacy Profile & Staff Details\n4. Pharmacy Near Me (Find Nearby Pharmacies)\n5. File a Complaint Against a Pharmacy\n6. Track Complaint Status\n0. Back to Main Menu\nEnter Choice (0-6): ";

        int option;
        option = getSafeInt();
        if (option == 1) { searchMedicineByGroup(); pauseScreen(); }
        else if (option == 2) { verifyMedicineByBatch(); pauseScreen(); }
        else if (option == 3) { showPharmacyStaffInfo(); pauseScreen(); }
        else if (option == 4) { findPharmaciesNearMe(); pauseScreen(); }
        else if (option == 5) { filePharmacyComplaint(); pauseScreen(); }
        else if (option == 6) { trackComplaintStatus(); pauseScreen(); }
        else if (option == 0) break; 
    }
}

// secured login and register section

void registerNewUser() {
    clearScreen();
    cout << "\n>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n";
    cout << colorCyan("       DYNAMIC USER REGISTRATION PORTAL     ") << "\n";
    cout << "---------------------------------------------\n";
    User newUser;
    cout << "Enter Username (0 to Cancel): ";
    cin >> newUser.username;
    if (newUser.username == "0") return;
    newUser.username = trim(newUser.username);

    // username ache kina check kore

    for (const auto& u : allUsers) {
        if (u.username == newUser.username) {
            cout << colorRed("[ERROR] Username already exists!") << "\n";
            pauseScreen();
            return;
        }
    }

    cout << "Enter Password (0 to Cancel): ";
    cin >> newUser.password;
    if (newUser.password == "0") return;
    newUser.password = trim(newUser.password);

    cout << "Select Role (1. COMPANY, 2. PHARMACY) (0 to Cancel): ";
    int r;
    r = getSafeInt();
    if (r == 0) return;
    if (r != 1 && r != 2) {
        cout << colorRed("\n[ERROR] Only COMPANY or PHARMACY accounts can be registered.") << "\n";
        pauseScreen();
        return;
    }
    newUser.role = (r == 1) ? "COMPANY" : "PHARMACY";

    cout << "Enter Entity ID (e.g. 3 for Company, DSC_04 for Pharmacy) (0 to Cancel): ";
    cin >> newUser.entityId;
    if (newUser.entityId == "0") return;
    newUser.entityId = trim(newUser.entityId);

    cin.ignore();
    cout << "Enter Display Name (0 to Cancel): ";
    getline(cin, newUser.entityName);
    if (newUser.entityName == "0") return;
    newUser.entityName = trim(newUser.entityName);

    allUsers.push_back(newUser);
    saveDataToFiles();
    cout << colorGreen("\n[SUCCESS] User Registered Successfully! You can now login.") << "\n";
    pauseScreen();
}

bool handleLogin() {
    clearScreen();
    string user, pass;
    cout << "\n>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n";
    cout << colorCyan("             SYSTEM LOGIN PANEL             ") << "\n";
    cout << "---------------------------------------------\n";
    cout << "1. Company\n2. Pharmacy\n0. Cancel\nChoose Role: ";
    int roleChoice;
    roleChoice = getSafeInt();
    if (roleChoice == 0) return false;
    if (roleChoice != 1 && roleChoice != 2) {
        cout << colorRed("\n[ERROR] Invalid role selection.") << "\n";
        pauseScreen();
        return false;
    }
    const string selectedRole = (roleChoice == 1) ? "COMPANY" : "PHARMACY";

    cout << "Enter Username (0 to Cancel): ";
    cin >> user;
    if (user == "0") return false; 

    cout << "Enter Password : ";
    cin >> pass;

    user = trim(user);
    pass = trim(pass);

    for (size_t i = 0; i < allUsers.size(); i++) {
        if (allUsers[i].role == selectedRole &&
            allUsers[i].username == user && allUsers[i].password == pass) {
            currentUser = allUsers[i];
            isLoggedIn = true;
            cout << colorGreen("\n[SUCCESS] Login Successful! Welcome " + currentUser.entityName) << "\n";
            pauseScreen();
            return true;
        }
    }

    cout << colorRed("\n[ERROR] Invalid Username or Password!") << "\n";
    pauseScreen();
    return false;
}

void showRegulatoryComplaints(bool pendingOnly) {
    clearScreen();
    cout << colorCyan(pendingOnly ? "\n--- PENDING COMPLAINTS ---" : "\n--- ALL COMPLAINTS ---") << "\n";

    bool hasComplaints = false;
    for (const auto& complaint : complaintDatabase) {
        if (pendingOnly && complaint.status != "Pending") continue;
        if (hasComplaints) cout << "---------------------------------------------\n";
        displayComplaintDetails(complaint);
        hasComplaints = true;
    }

    if (!hasComplaints) {
        cout << (pendingOnly ? "No pending complaints found.\n" : "No complaints found.\n");
    }
}

void updateComplaintStatus() {
    clearScreen();
    cout << colorCyan("\n--- PENDING COMPLAINTS ---") << "\n";
    cout << left << setw(16) << "COMPLAINT ID" << setw(16) << "PHARMACY ID"
         << setw(32) << "PHARMACY NAME" << "STATUS\n";
    cout << "--------------------------------------------------------------------------\n";

    bool hasPendingComplaints = false;
    for (const auto& complaint : complaintDatabase) {
        if (complaint.status != "Pending") continue;

        string pharmacyName;
        for (const auto& pharmacy : pharmacyInfoDatabase) {
            if (pharmacy.pharmacyId == complaint.pharmacyId) {
                pharmacyName = pharmacy.pharmacyName;
                break;
            }
        }

        cout << left << setw(16) << complaint.complaintId << setw(16) << complaint.pharmacyId
             << setw(32) << pharmacyName << colorYellow("Pending") << "\n";
        hasPendingComplaints = true;
    }

    if (!hasPendingComplaints) {
        cout << "No pending complaints found.\n";
        pauseScreen();
        return;
    }

    cout << "Enter Complaint ID to view full details (0 to Back): ";
    string complaintId;
    cin >> complaintId;
    if (complaintId == "0") return;
    complaintId = trim(complaintId);

    for (auto& complaint : complaintDatabase) {
        if (complaint.complaintId != complaintId) continue;
        if (complaint.status != "Pending") {
            cout << colorRed("\n[ERROR] Complaint is not currently pending.") << "\n";
            pauseScreen();
            return;
        }

        clearScreen();
        cout << colorCyan("\n--- RESOLVE / UPDATE COMPLAINT STATUS ---") << "\n";
        cout << "\n";
        cout << "Complaint ID   : " << complaint.complaintId << "\n";
        cout << "Pharmacy ID    : " << complaint.pharmacyId << "\n";
        cout << "Customer Name  : " << complaint.customerName << "\n";
        cout << "Contact        : " << complaint.customerContact << "\n";
        cout << "Issue Type     : " << complaint.issueType << "\n";
        cout << "Date           : " << complaint.date << "\n";
        cout << "Description    : " << complaint.description << "\n";
        cout << "Current Status : " << getComplaintStatusColor(complaint.status) << "\n";
        cout << "\n1. Resolved\n2. Dismissed\n0. Cancel\nChoose Action: ";
        int statusChoice;
        statusChoice = getSafeInt();
        if (statusChoice == 0) return;
        if (statusChoice != 1 && statusChoice != 2) {
            cout << colorRed("\n[ERROR] Invalid status selection.") << "\n";
            pauseScreen();
            return;
        }

        complaint.status = (statusChoice == 1) ? "Resolved" : "Dismissed";
        cin.ignore(numeric_limits<streamsize>::max(), '\n');
        cout << "Enter Admin Remarks: ";
        getline(cin, complaint.adminRemarks);
        complaint.adminRemarks = trim(complaint.adminRemarks);
        saveDataToFiles();
        cout << colorGreen("\n[SUCCESS] Complaint status updated and saved.") << "\n";
        pauseScreen();
        return;
    }

    cout << colorRed("\n[ERROR] Complaint ID not found.") << "\n";
    pauseScreen();
}

void showPharmacyComplaintSummaryReport() {
    clearScreen();
    cout << colorCyan("\n--- PHARMACY COMPLAINT SUMMARY REPORT ---") << "\n";
    cout << left << setw(18) << "Pharmacy ID" << setw(34) << "Pharmacy Name"
         << right << setw(8) << "Total" << setw(18) << "True"
         << setw(20) << "False" << setw(12) << "Pending\n";
    cout << "-------------------------------------------------------------------------------------------------------------\n";

    bool hasComplaints = false;
    for (const auto& pharmacy : pharmacyInfoDatabase) {
        int total = 0;
        int resolved = 0;
        int dismissed = 0;
        int pending = 0;
        for (const auto& complaint : complaintDatabase) {
            if (complaint.pharmacyId != pharmacy.pharmacyId) continue;
            ++total;
            if (complaint.status == "Resolved") ++resolved;
            else if (complaint.status == "Dismissed") ++dismissed;
            else if (complaint.status == "Pending") ++pending;
        }

        if (total == 0) continue;
        hasComplaints = true;
        cout << left << setw(18) << pharmacy.pharmacyId << setw(32) << pharmacy.pharmacyName
             << right << setw(8) << total
             << setw(18) << resolved << setw(20) << dismissed << setw(10) << pending
             << "\n";
    }

    if (!hasComplaints) {
        cout << "[INFO] No complaints have been filed against any pharmacy yet.\n";
    }
}

void regulatoryAuthorityPortal() {
    clearScreen();
    cout << "\n>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n";
    cout << colorCyan("       REGULATORY AUTHORITY LOGIN           ") << "\n";
    cout << "---------------------------------------------\n";
    string user, pass;
    cout << "Enter Username (0 to Cancel): ";
    cin >> user;
    if (user == "0") return;
    cout << "Enter Password (0 to Cancel): ";
    cin >> pass;
    if (pass == "0") return;

    user = trim(user);
    pass = trim(pass);
    bool authenticated = false;
    for (const auto& account : allUsers) {
        if (account.role == "REGULATOR" &&
            account.username == user && account.password == pass) {
            currentUser = account;
            isLoggedIn = true;
            authenticated = true;
            break;
        }
    }
    if (!authenticated) {
        cout << colorRed("\n[ERROR] Invalid Regulatory Authority username or password.") << "\n";
        pauseScreen();
        return;
    }

    cout << colorGreen("\n[SUCCESS] Regulatory Authority login successful.") << "\n";
    pauseScreen();
    while (isLoggedIn) {
        clearScreen();
        cout << "\n>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n";
        cout << colorCyan("       REGULATORY AUTHORITY DASHBOARD       ") << "\n";
        cout << "---------------------------------------------\n";
        cout << "1. View All Complaints\n"
             << "2. Resolve / Update Complaint Status\n"
             << "3. Pharmacy Complaint Summary Report\n"
             << "0. Logout\nEnter Choice (0-3): ";

        int choice;
        choice = getSafeInt();
        if (choice == 1) { showRegulatoryComplaints(false); pauseScreen(); }
        else if (choice == 2) { updateComplaintStatus(); }
        else if (choice == 3) { showPharmacyComplaintSummaryReport(); pauseScreen(); }
        else if (choice == 0) { isLoggedIn = false; break; }
    }
}

// company admin dashboard

void companyProductionEntry() {
    clearScreen();
    cout << colorCyan("\n--- NEW PRODUCTION ENTRY (" + currentUser.entityName + ") ---") << "\n";
    ProductionRecord newProd;
    newProd.companyName = currentUser.entityName;

    cout << "\nSelect Drug Group:\n";
    for (int i = 0; i < 4; i++) cout << "  " << i + 1 << ". " << DRUG_GROUPS[i] << "\n";
    cout << "  0. Cancel\nEnter Choice: ";
    int groupChoice;
    groupChoice = getSafeInt();
    if (groupChoice < 1 || groupChoice > 4) return;
    newProd.drugGroup = DRUG_GROUPS[groupChoice - 1];

    cout << "Enter Production Quantity: ";
    newProd.totalQuantity = getSafeInt();
    cout << "Enter Unit Price per piece (in BDT): ";
    cin >> newProd.unitPrice;
    cout << "Enter Production Date (DD-MM-YYYY): ";
    while (cin >> newProd.prodDate) {
        if (!isValidDateFormat(newProd.prodDate)) {
            cout << colorRed("[ERROR] Invalid date. Enter a valid calendar date in DD-MM-YYYY format.") << "\n";
            cout << "Enter Production Date (DD-MM-YYYY): ";
            continue;
        }

        if (parseDateToNumeric(newProd.prodDate) > getCurrentDateNumeric()) {
            cout << colorRed("[ERROR] Production date cannot be in the future.") << "\n";
            cout << "Enter Production Date (DD-MM-YYYY): ";
            continue;
        }

        break;
    }
    if (!cin) return;

    cout << "Enter Expiry Date (DD-MM-YYYY): ";
    while (cin >> newProd.expDate) {
        if (!isValidDateFormat(newProd.expDate)) {
            cout << colorRed("[ERROR] Invalid date. Enter a valid calendar date in DD-MM-YYYY format.") << "\n";
            cout << "Enter Expiry Date (DD-MM-YYYY): ";
            continue;
        }

        if (parseDateToNumeric(newProd.expDate) <= parseDateToNumeric(newProd.prodDate)) {
            cout << colorRed("[ERROR] Expiry date must be later than the production date ("
                             + newProd.prodDate + ").") << "\n";
            cout << "Enter Expiry Date (DD-MM-YYYY): ";
            continue;
        }

        break;
    }
    if (!cin) return;

    string expCode = extractMMYYFromDate(newProd.expDate);
    string compPrefix = (currentUser.entityId == "1") ? "CPA" : "CPB";
    string companySuffix = (currentUser.entityId == "1") ? "A" : "B";

    int companyProdCount = getCompanyProductionCount(currentUser.entityName) + 1;
    string prodIdCode = "P" + (companyProdCount < 10 ? "0" + to_string(companyProdCount) : to_string(companyProdCount)) + companySuffix;
    newProd.batchNumber = compPrefix + "-G" + to_string(groupChoice) + "-" + prodIdCode + "-" + expCode;

    productionDatabase.push_back(newProd);
    saveDataToFiles();

    cout << colorGreen("\n[SUCCESS] Production Added Successfully!") << "\n";
    cout << "Batch Number: " << newProd.batchNumber << "\n";
}

void companyDispatchSupply() {
    clearScreen();
    cout << colorCyan("\n--- DISPATCH / SUPPLY MEDICINE ---") << "\n";
    string batch;
    cout << "Enter Batch Number (0 to Cancel): ";
    cin >> batch;
    if (batch == "0") return; 

    bool isMyBatch = false;
    int totalProduced = 0;
    string selectedDrugGroup;
    ProductionRecord matchedRecord;

    for (const auto& prod : productionDatabase) {
        if (prod.batchNumber == batch) {
            if (prod.companyName == currentUser.entityName) {
                isMyBatch = true;
                totalProduced = prod.totalQuantity;
                selectedDrugGroup = prod.drugGroup;
                matchedRecord = prod;
            } else {
                cout << colorRed("\n[SECURITY VIOLATION] This batch belongs to another company!") << "\n";
                return;
            }
            break;
        }
    }

    if (!isMyBatch) {
        cout << colorRed("\n[ERROR] Invalid Batch Number!") << "\n";
        return;
    }

    if (isExpired(matchedRecord.expDate)) {
        cout << colorRed("\n[CRITICAL ERROR] Cannot supply! This medicine batch is already EXPIRED.") << "\n";
        return;
    }

    int supplied = getTotalSuppliedByBatch(batch);
    int avail = totalProduced - supplied;

    if (avail <= 0) {
        cout << colorRed("\n[ERROR] Stock exhausted for this batch!") << "\n";
        return;
    }

    SupplyRecord newSupply;
    newSupply.batchNumber = batch;

    string companySuffix = (currentUser.entityId == "1") ? "A" : "B";
    int companySupCount = getCompanySupplyCount(currentUser.entityName) + 1;
    newSupply.supplyId = "S" + (companySupCount < 10 ? "0" + to_string(companySupCount) : to_string(companySupCount)) + companySuffix;

    cout << "\nAVAILABLE PHARMACIES FOR " << selectedDrugGroup << ":\n";
    cout << left << setw(14) << "PHARMACY ID" << setw(25) << "PHARMACY NAME"
         << setw(24) << "OWNER NAME" << setw(14) << "AREA" << "AVAILABLE QTY\n";
    cout << "-----------------------------------------------------------------------------------------\n";
    for (const auto& pharmacy : pharmacyInfoDatabase) {
        int groupStock = 0;
        for (const auto& production : productionDatabase) {
            if (production.drugGroup == selectedDrugGroup && !isExpired(production.expDate)) {
                int received = getTotalSuppliedToPharmacy(production.batchNumber, pharmacy.pharmacyId);
                int sold = getTotalSoldByPharmacy(production.batchNumber, pharmacy.pharmacyId);
                if (received > sold) groupStock += received - sold;
            }
        }
        cout << left << setw(14) << pharmacy.pharmacyId << setw(25) << pharmacy.pharmacyName
             << setw(24) << pharmacy.ownerName << setw(14) << pharmacy.areaLocation
             << groupStock << " pcs\n";
    }

    cout << "Select Target Pharmacy ID (0 to Cancel): ";
    cin >> newSupply.pharmacyId;
    if (newSupply.pharmacyId == "0") return;

    bool validPharmacy = false;
    for (const auto& pharmacy : pharmacyInfoDatabase) {
        if (pharmacy.pharmacyId == newSupply.pharmacyId) {
            validPharmacy = true;
            break;
        }
    }
    if (!validPharmacy) {
        cout << colorRed("[ERROR] Invalid Pharmacy ID!") << "\n";
        return;
    }

    cout << "Enter Supply Quantity (Max " << avail << "): ";
    newSupply.quantity = getSafeInt();
    if (newSupply.quantity > avail) {
        cout << colorRed("[ERROR] Exceeds available stock!") << "\n";
        return;
    }

    cout << "Enter Supply Date (DD-MM-YYYY): ";
    while (cin >> newSupply.supplyDate) {
        if (!isValidDateFormat(newSupply.supplyDate)) {
            cout << colorRed("[ERROR] Invalid date. Enter a valid calendar date in DD-MM-YYYY format.") << "\n";
            cout << "Enter Supply Date (DD-MM-YYYY): ";
            continue;
        }

        int supplyDateNumeric = parseDateToNumeric(newSupply.supplyDate);
        int prodDateNumeric = parseDateToNumeric(matchedRecord.prodDate);
        if (supplyDateNumeric < prodDateNumeric) {
            cout << colorRed("[ERROR] Supply date cannot be earlier than the production date ("
                             + matchedRecord.prodDate + ").") << "\n";
            cout << "Enter Supply Date (DD-MM-YYYY): ";
            continue;
        }

        int expiryDateNumeric = parseDateToNumeric(matchedRecord.expDate);
        if (supplyDateNumeric > expiryDateNumeric) {
            cout << colorRed("[ERROR] Supply date cannot be after the expiry date ("
                             + matchedRecord.expDate + ").") << "\n";
            cout << "Enter Supply Date (DD-MM-YYYY): ";
            continue;
        }

        break;
    }
    if (!cin) return;

    supplyDatabase.push_back(newSupply);
    saveDataToFiles();

    cout << colorGreen("\n[SUCCESS] Supply Dispatched & Saved!") << "\n";
}

void showCompanyProductionHistory() {
    clearScreen();
    cout << "\n===============================================================================================================\n";
    cout << left << setw(24) << "BATCH NO" << setw(15) << "GROUP" << setw(12) << "PRODUCED"
         << setw(12) << "SUPPLIED" << setw(18) << "REMAINING STOCK" << setw(12) << "PROD DATE"
         << setw(12) << "EXPIRY" << "\n";
    cout << "---------------------------------------------------------------------------------------------------------------\n";

    for (const auto& prod : productionDatabase) {
        if (prod.companyName == currentUser.entityName) {
            int supplied = getTotalSuppliedByBatch(prod.batchNumber);
            int remaining = prod.totalQuantity - supplied;
            string expStatus = isExpired(prod.expDate) ? colorRed(" EXPIRED") : "";

            cout << left << setw(24) << prod.batchNumber << setw(15) << prod.drugGroup << setw(12) << prod.totalQuantity
                 << setw(12) << supplied << setw(18) << (to_string(remaining) + " pcs")
                 << setw(12) << prod.prodDate << setw(12) << prod.expDate << expStatus << "\n";
        }
    }
}

void showCompanySupplyHistory() {
    clearScreen();
    cout << colorCyan("\n--- DISPATCH / SUPPLY HISTORY (" + currentUser.entityName + ") ---") << "\n";
    cout << left << setw(12) << "SUPPLY ID" << setw(24) << "BATCH NO" << setw(18) << "DRUG GROUP"
         << setw(16) << "PHARMACY ID" << setw(14) << "SUPPLIED QTY"
         << setw(16) << "AVAILABLE QTY" << "SUPPLY DATE\n";
    cout << "-------------------------------------------------------------------------------------------------------------\n";

    bool hasRecords = false;
    for (const auto& supply : supplyDatabase) {
        for (const auto& production : productionDatabase) {
            if (production.batchNumber == supply.batchNumber && production.companyName == currentUser.entityName) {
                int received = getTotalSuppliedToPharmacy(supply.batchNumber, supply.pharmacyId);
                int sold = getTotalSoldByPharmacy(supply.batchNumber, supply.pharmacyId);
                int avail = received - sold;

                cout << left << setw(12) << supply.supplyId << setw(24) << supply.batchNumber
                     << setw(18) << production.drugGroup << setw(16) << supply.pharmacyId
                     << setw(14) << supply.quantity << setw(16) << (to_string(avail) + " pcs")
                     << supply.supplyDate << "\n";
                hasRecords = true;
                break;
            }
        }
    }

    if (!hasRecords) cout << "No dispatch history found for this company.\n";
}

void openCompanyDashboard() {
    while (isLoggedIn) {
        clearScreen();
        cout << "\n>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n";
        cout << colorCyan("       DASHBOARD: " + currentUser.entityName + " ADMIN") << "\n";
        cout << "---------------------------------------------\n";
        cout << "1. Add New Production Entry\n2. Dispatch / Supply Medicine to Pharmacy\n3. View Production History & Remaining Stock\n4. Dispatch / Supply History\n0. Logout\nEnter Choice (0-4): ";

        int choice;
        choice = getSafeInt();
        if (choice == 1) { companyProductionEntry(); pauseScreen(); }
        else if (choice == 2) { companyDispatchSupply(); pauseScreen(); }
        else if (choice == 3) { showCompanyProductionHistory(); pauseScreen(); }
        else if (choice == 4) { showCompanySupplyHistory(); pauseScreen(); }
        else if (choice == 0) { isLoggedIn = false; break; }
    }
}

// pharmacy admin dashboard and pos

void checkLowStockAlerts() {
    bool hasLowStock = false;
    for (const auto& sup : supplyDatabase) {
        if (sup.pharmacyId == currentUser.entityId) {
            int rec = getTotalSuppliedToPharmacy(sup.batchNumber, currentUser.entityId);
            int sold = getTotalSoldByPharmacy(sup.batchNumber, currentUser.entityId);
            int rem = rec - sold;

            if (rem < 10 && rem > 0) {
                if (!hasLowStock) cout << colorYellow("\n[LOW STOCK WARNINGS]:") << "\n";
                cout << colorYellow(" -> Batch [" + sup.batchNumber + "] has only " + to_string(rem) + " pcs remaining!") << "\n";
                hasLowStock = true;
            }
        }
    }
}

void pharmacySalesCounter() {
    clearScreen();
    cout << colorCyan("\n--- LIVE PHARMACY COUNTER (" + currentUser.entityName + ") ---") << "\n";
    string batch;
    cout << "Enter Medicine Batch Number (0 to Cancel): ";
    cin >> batch;
    if (batch == "0") return; 

    // expairy check for the batch
    for (const auto& prod : productionDatabase) {
        if (prod.batchNumber == batch) {
            if (isExpired(prod.expDate)) {
                cout << colorRed("\n[CRITICAL ERROR] Cannot sell medicine! This batch is EXPIRED!") << "\n";
                return;
            }
            break;
        }
    }

    double unitPrice = getUnitPriceForBatch(batch);
    int received = getTotalSuppliedToPharmacy(batch, currentUser.entityId);
    int sold = getTotalSoldByPharmacy(batch, currentUser.entityId);
    int currentStock = received - sold;

    cout << "LIVE STOCK: " << currentStock << " pcs | Price: " << unitPrice << " BDT\n";
    cout << "Enter Sell Quantity: ";
    int sellQty;
    sellQty = getSafeInt();

    if (sellQty > 0 && sellQty <= currentStock) {
        double totalBill = sellQty * unitPrice;
        string salesId = generateNextSalesId(currentUser.entityId);
        salesDatabase.push_back({salesId, batch, currentUser.entityId, sellQty, totalBill});
        saveDataToFiles();

        cout << colorGreen("\n[SUCCESS] Sale Completed!") << "\n";
        cout << "Sales ID: " << salesId << "\n";
        cout << "Total Bill: " << totalBill << " BDT\n";

        string groupName = "";
        for (const auto& prod : productionDatabase) {
            if (prod.batchNumber == batch) {
                groupName = prod.drugGroup;
                break;
            }
        }

        generatePrintedInvoice(currentUser.entityName, batch, groupName, sellQty, unitPrice, totalBill);
    } else {
        cout << colorRed("\n[ERROR] Invalid Quantity or Insufficient Stock!") << "\n";
    }
}

void showPharmacySalesHistory() {
    clearScreen();
    cout << colorCyan("\n--- DETAILED SALES HISTORY (" + currentUser.entityName + ") ---") << "\n";
    cout << left << setw(12) << "SALES ID" << setw(20) << "BATCH NO" << setw(22) << "COMPANY NAME"
         << setw(18) << "DRUG GROUP" << setw(12) << "QUANTITY"
         << setw(14) << "UNIT PRICE" << "TOTAL PRICE\n";
    cout << "------------------------------------------------------------------------------------------------------\n";

    bool hasRecords = false;
    for (const auto& sale : salesDatabase) {
        if (sale.pharmacyId != currentUser.entityId) continue;

        for (const auto& production : productionDatabase) {
            if (production.batchNumber == sale.batchNumber) {
                ostringstream unitPrice;
                unitPrice << fixed << setprecision(2) << production.unitPrice;
                ostringstream totalPrice;
                totalPrice << fixed << setprecision(2) << sale.totalPrice;

                cout << left << setw(12) << sale.salesId << setw(20) << sale.batchNumber
                     << setw(22) << production.companyName << setw(18) << production.drugGroup
                     << setw(12) << sale.soldQuantity << setw(14) << unitPrice.str()
                     << totalPrice.str() << "\n";
                hasRecords = true;
                break;
            }
        }
    }

    if (!hasRecords) cout << "No sales history found for this pharmacy.\n";
}

void pharmacyInventoryReport() {
    clearScreen();
    cout << "\n>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n";
    cout << colorCyan("    INVENTORY & SALES REPORT: " + currentUser.entityName) << "\n";
    cout << "---------------------------------------------\n";

    double totalRevenue = 0.0;
    for (const auto& sup : supplyDatabase) {
        if (sup.pharmacyId == currentUser.entityId) {
            string batch = sup.batchNumber;
            int rec = getTotalSuppliedToPharmacy(batch, currentUser.entityId);
            int sold = getTotalSoldByPharmacy(batch, currentUser.entityId);
            cout << "Batch: " << batch << " | Rec: " << rec << " | Sold: " << sold << " | Stock: " << (rec - sold) << "\n";
        }
    }
    for (const auto& sale : salesDatabase) {
        if (sale.pharmacyId == currentUser.entityId) totalRevenue += sale.totalPrice;
    }
    ostringstream formattedRevenue;
    formattedRevenue << fixed << setprecision(2) << totalRevenue;
    cout << "-------------------------------------------------------\n";
    cout << colorGreen(" TOTAL PHARMACY REVENUE: " + formattedRevenue.str() + " BDT") << "\n";
}

void openPharmacyDashboard() {
    while (isLoggedIn) {
        clearScreen();
        checkLowStockAlerts();
        cout << "\n>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n";
        cout << colorCyan("       DASHBOARD: " + currentUser.entityName) << "\n";
        cout << "---------------------------------------------\n";
        cout << "1. Live Counter POS (Sell Medicine)\n2. View Detailed Sales History\n"
             << "3. View Stock & Revenue Report\n0. Logout\nEnter Choice (0-3): ";

        int choice;
        choice = getSafeInt();
        if (choice == 1) { pharmacySalesCounter(); pauseScreen(); }
        else if (choice == 2) { showPharmacySalesHistory(); pauseScreen(); }
        else if (choice == 3) { pharmacyInventoryReport(); pauseScreen(); }
        else if (choice == 0) { isLoggedIn = false; break; }
    }
}

// main function

int main() {
#ifdef _WIN32
    SetConsoleOutputCP(CP_UTF8);
    SetConsoleCP(CP_UTF8);
#endif
    loadDataFromFiles();

    while (true) {
        clearScreen();
        cout << "\n>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n";
        cout << colorCyan("      PHARMA MANAGEMENT & TRACKING SYSTEM   ") << "\n";
        cout << "---------------------------------------------\n";
        cout << "1. Public Customer Portal\n"
             << "2. System Login (Company / Pharmacy)\n"
             << "3. New Registration (Company / Pharmacy)\n"
             << "4. Regulatory Authority Portal\n"
             << "5. Talk with MediNa AI Assistant\n"
             << "0. Exit System\nEnter Choice (0-5): ";

        int mainChoice;
        mainChoice = getSafeInt();

        if (mainChoice == 1) publicCustomerVerification();
        else if (mainChoice == 2) {
            if (handleLogin()) {
                if (currentUser.role == "COMPANY") openCompanyDashboard();
                else if (currentUser.role == "PHARMACY") openPharmacyDashboard();
            }
        } 
        else if (mainChoice == 3) registerNewUser();
        else if (mainChoice == 4) regulatoryAuthorityPortal();
        else if (mainChoice == 5) mediNaAiAssistantPortal();
        else if (mainChoice == 0) {
            saveDataToFiles();
            cout << colorGreen("\nAll Data Has Been Saved Successfully. Exiting System. Thank you!\n");
            break;
        } 
        else {
            cout << colorRed("\n[ERROR] Invalid Input!\n");
            pauseScreen();
        }
    }

    return 0;
}