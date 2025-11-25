# Troubleshooting 404 Error for `/api/v1/user/signupWithPhone`

## Issue Fixed
The error was caused by incorrect paths in models located in subdirectories:
- `models/course/courseCategory.js` - Fixed path from `../utils/lazyModelLoader` to `../../utils/lazyModelLoader`
- `models/course/courseSubCategory.js` - Fixed path from `../utils/lazyModelLoader` to `../../utils/lazyModelLoader`

## Solution Steps

### 1. **Restart Your Backend Server**
After fixing the path issues, you MUST restart your server:

```bash
# Stop the current server (Ctrl+C)
# Then restart it
npm start
# or
npm run dev
```

### 2. **Verify MongoDB Connection**
Routes are only loaded AFTER MongoDB successfully connects. Check your server logs for:
```
✅ MONGODB CONNECTION SUCCESSFUL
📚 LOADING API ROUTES
✅ User routes loaded successfully
```

If you see MongoDB connection errors, routes won't be registered.

### 3. **Check Server Logs**
When you start the server, you should see:
- ✅ MongoDB connection successful
- ✅ User routes loaded successfully
- No errors about missing modules

### 4. **Verify Route Registration**
After server starts, check the console for:
```
👤 Loading user routes...
✅ User routes loaded successfully
```

### 5. **Test the Endpoint**
After restarting, try the signup endpoint again:
```bash
POST http://localhost:8890/api/v1/user/signupWithPhone
```

## Common Issues

### Issue 1: Routes Not Loading
**Symptom**: 404 error persists after restart

**Solution**: 
- Check MongoDB connection in server logs
- Verify `DB_URL` in `.env` is correct
- Check for any module loading errors in console

### Issue 2: MongoDB Connection Failing
**Symptom**: Server starts but routes aren't registered

**Solution**:
- Verify MongoDB is running
- Check `DB_URL` in `.env` file
- Ensure MongoDB connection string is correct

### Issue 3: Module Loading Errors
**Symptom**: Server crashes or shows module errors

**Solution**:
- Verify all model files have correct paths to `lazyModelLoader`
- Check that `utils/lazyModelLoader.js` exists
- Models in subdirectories should use `../../utils/lazyModelLoader`

## Verification

To verify routes are working, check your server console when making a request. You should see:
```
📥 [timestamp] POST /api/v1/user/signupWithPhone
```

If you see this, the route is registered. If you see a 404 HTML page, routes aren't loaded.

## Still Having Issues?

1. Check server console for any error messages
2. Verify MongoDB connection is successful
3. Ensure all model files are using correct paths
4. Restart the server completely (not just reload)

