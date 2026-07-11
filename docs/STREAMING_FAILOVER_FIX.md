# Streaming Failover Fix

## Problem

The failover system was not activating for streaming requests. When Groq returned a 429 error during streaming, the error bubbled up directly to ConversationService instead of being caught and retried with the next provider.

**Evidence:**
```
[ERROR] [ConversationService] Streaming error
Groq API error 429 ...
```

## Root Cause

The `chatStream` method in FailoverProvider was selecting a provider but not properly catching errors during the streaming iteration. When an async generator throws an error during `for await` iteration, the error propagates to the caller and cannot be caught by try/catch blocks within the same generator.

## Solution

Refactored the `chatStream` method to properly handle errors during streaming:

### Key Changes

1. **Direct iteration with error handling:**
   ```typescript
   try {
     const streamGenerator = health.provider.chatStream(request);
     for await (const chunk of streamGenerator) {
       yield chunk;
     }
     // Success path
   } catch (error) {
     // Error path - try next provider
   }
   ```

2. **Error classification:** Detects and logs specific error types:
   - 429 (rate limit)
   - Timeouts
   - 5xx (server errors)
   - Connection failures

3. **Exponential backoff:** Applies delays between provider attempts:
   - 1 second before 2nd provider
   - 2 seconds before 3rd provider

4. **Comprehensive logging:**
   ```
   [INFO] Active provider chain: groq -> gemini -> ollama
   [INFO] Attempting streaming with groq
   [WARN] Provider groq failed with 429
   [INFO] Attempting provider gemini
   [INFO] Provider gemini succeeded
   ```

## Expected Behavior

### Scenario 1: Groq fails, Gemini succeeds
```
1. User sends streaming message
2. FailoverProvider logs: Active provider chain: groq -> gemini -> ollama
3. FailoverProvider attempts streaming with groq
4. Groq returns 429 during streaming
5. FailoverProvider catches error and logs: [WARN] Provider groq failed with 429
6. FailoverProvider waits 1 second
7. FailoverProvider logs: [INFO] Attempting provider gemini
8. Gemini streams successfully
9. User receives response seamlessly
10. FailoverProvider logs: [INFO] Provider gemini succeeded
```

### Scenario 2: All providers fail
```
1. User sends streaming message
2. Groq fails with 429
3. Gemini fails with 500
4. Ollama fails with connection refused
5. FailoverProvider logs: [ERROR] All providers failed: groq, gemini, ollama
6. Error propagates to ConversationService
7. User sees: "All configured AI providers are currently unavailable."
```

## Verification

### Build Status
```bash
✅ npm run build - PASSED
✅ npx tsc --noEmit - PASSED
```

### Log Verification

Enable debug logging and verify these log messages appear:

**Initialization:**
```
[INFO] Failover provider initialized
[INFO] Provider priority loaded from env: groq -> gemini -> ollama
[INFO] Initialized 3/3 providers
```

**Streaming with failover:**
```
[INFO] Active provider chain: groq -> gemini -> ollama
[INFO] Attempting streaming with groq
[WARN] Provider groq failed with 429
[INFO] Attempting provider gemini
[INFO] Provider gemini succeeded
```

**Error cases:**
```
[WARN] Skipping unhealthy provider: groq
[ERROR] All providers failed: groq, gemini, ollama
```

## Architecture

### Before (Broken)
```
ConversationService
    ↓
FailoverProvider.chatStream()
    ↓
    Selects provider
    ↓
    for await (provider.chatStream())  // Error not caught!
    ↓
    throws error → ConversationService
```

### After (Fixed)
```
ConversationService
    ↓
FailoverProvider.chatStream()
    ↓
    for each provider in priority order:
      ↓
      try:
        for await (provider.chatStream())
          yield chunk
        // Success - return
      ↓
      catch (error):
        mark provider failed
        log failure
        apply backoff
        continue to next provider
    ↓
    if all failed:
      throw final error
```

## Constraints Met

✅ Do not modify ConversationService business logic
✅ Do not modify RAG pipeline
✅ Keep changes localized to provider abstraction and failover orchestration
✅ Preserve existing AIProvider interface
✅ Streaming support continues working
✅ Both chat() and chatStream() use same failover logic

## Testing

To test streaming failover:

1. **Enable failover:**
   ```bash
   export AI_FAILOVER_ENABLED=true
   export AI_PROVIDER_PRIORITY=groq,gemini,ollama
   ```

2. **Exhaust Groq quota** to trigger 429 errors

3. **Send streaming message** and observe logs:
   ```bash
   # Should see:
   [INFO] Active provider chain: groq -> gemini -> ollama
   [INFO] Attempting streaming with groq
   [WARN] Provider groq failed with 429
   [INFO] Attempting provider gemini
   [INFO] Provider gemini succeeded
   ```

4. **Verify response** arrives successfully via Gemini

## Error Handling Matrix

| Error Type | Caught by Failover | Example |
|------------|-------------------|---------|
| HTTP 429 | ✅ Yes | Rate limit exceeded |
| HTTP 500 | ✅ Yes | Internal server error |
| HTTP 502 | ✅ Yes | Bad gateway |
| HTTP 503 | ✅ Yes | Service unavailable |
| Timeout | ✅ Yes | Network timeout |
| ECONNREFUSED | ✅ Yes | Provider unavailable |
| HTTP 400 | ❌ No | Bad request (client error) |
| HTTP 401 | ❌ No | Unauthorized |
| HTTP 403 | ❌ No | Forbidden |