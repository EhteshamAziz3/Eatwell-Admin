
import axios from 'axios';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

import api from '../services/api';
import { AdminUser, useAuthStore } from '../store/auth';

interface LoginResponse {
    success: boolean;
    message: string;
    token: string;
    user: AdminUser;
}

export default function LoginScreen() {
    const router = useRouter();

    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');


    const handleLogin = async () => {
        setError('');

        const cleanPhone = phone.replace(/\D/g, '');

        if (cleanPhone.length !== 10) {
            setError('Please enter a valid 10-digit mobile number.');
            return;
        }

        if (!password.trim()) {
            setError('Please enter your password.');
            return;
        }

        try {
            setLoading(true);
            console.log('STEP 1: Login started');

            console.log('STEP 2: Calling admin API');

            const response = await api.post<LoginResponse>(
                '/auth/admin/login',
                {
                    phone: cleanPhone,
                    password,
                }
            );

            console.log('STEP 3: API response received', response.status);

            const data = response.data;

            if (!data.success || !data.token || data.user?.role !== 'admin') {
                setError(data.message || 'Admin login failed.');
                return;
            }

            console.log('STEP 4: Saving admin session');

            await useAuthStore.getState().setAuth(data.token, data.user);

            console.log('STEP 5: Session saved');

            setLoading(false);

            console.log('STEP 6: Opening dashboard');

            router.replace('/dashboard');

        } catch (err) {
            console.log('LOGIN ERROR:', err);

            if (axios.isAxiosError(err)) {
                setError(
                    err.response?.data?.message ||
                    err.message ||
                    'Unable to connect. Please try again.'
                );
            } else {
                setError(
                    err instanceof Error ? err.message : 'Something went wrong.'
                );
            }

            setLoading(false);
        }
    };
    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.logo}>
                    <Text style={styles.logoText}>E</Text>
                </View>

                <Text style={styles.brand}>EatWell</Text>
                <Text style={styles.admin}>ADMIN PORTAL</Text>

                <View style={styles.heading}>
                    <Text style={styles.title}>Welcome back!</Text>
                    <Text style={styles.subtitle}>
                        Sign in to manage your restaurant.
                    </Text>
                </View>

                <View style={styles.form}>
                    <Text style={styles.label}>MOBILE NUMBER</Text>

                    <TextInput
                        style={styles.input}
                        placeholder="Enter mobile number"
                        placeholderTextColor="#778196"
                        keyboardType="phone-pad"
                        maxLength={10}
                        value={phone}
                        editable={!loading}
                        onChangeText={(value) => {
                            setPhone(value.replace(/\D/g, ''));
                            setError('');
                        }}
                    />

                    <Text style={styles.label}>PASSWORD</Text>

                    <View style={styles.passwordBox}>
                        <TextInput
                            style={styles.passwordInput}
                            placeholder="Enter your password"
                            placeholderTextColor="#778196"
                            secureTextEntry={!showPassword}
                            value={password}
                            editable={!loading}
                            onChangeText={(value) => {
                                setPassword(value);
                                setError('');
                            }}
                            onSubmitEditing={handleLogin}
                            returnKeyType="go"
                        />

                        <TouchableOpacity
                            disabled={loading}
                            onPress={() => setShowPassword(!showPassword)}
                        >
                            <Text style={styles.show}>
                                {showPassword ? 'HIDE' : 'SHOW'}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {error ? (
                        <View style={styles.errorBox}>
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    ) : null}

                    <TouchableOpacity
                        style={[
                            styles.button,
                            loading && styles.buttonDisabled,
                        ]}
                        activeOpacity={0.85}
                        onPress={handleLogin}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#101827" />
                        ) : (
                            <Text style={styles.buttonText}>
                                SIGN IN  →
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>

                <Text style={styles.footer}>
                    SECURE ADMIN ACCESS • EATWELL
                </Text>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#101827',
    },
    content: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: 28,
        paddingVertical: 45,
    },
    logo: {
        width: 68,
        height: 68,
        borderRadius: 22,
        backgroundColor: '#F59E0B',
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
    },
    logoText: {
        fontSize: 38,
        fontWeight: '900',
        color: '#101827',
    },
    brand: {
        fontSize: 31,
        fontWeight: '900',
        color: '#FFFFFF',
        textAlign: 'center',
        marginTop: 15,
    },
    admin: {
        color: '#F59E0B',
        textAlign: 'center',
        letterSpacing: 4,
        fontSize: 11,
        fontWeight: '800',
        marginTop: 7,
    },
    heading: {
        marginTop: 55,
        marginBottom: 30,
    },
    title: {
        color: '#FFFFFF',
        fontSize: 29,
        fontWeight: '800',
    },
    subtitle: {
        color: '#9CA8BB',
        fontSize: 14,
        marginTop: 9,
    },
    form: {
        gap: 13,
    },
    label: {
        color: '#C6CEDA',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1.5,
        marginTop: 9,
    },
    input: {
        height: 56,
        borderRadius: 13,
        backgroundColor: '#1C293B',
        borderWidth: 1,
        borderColor: '#344258',
        paddingHorizontal: 16,
        color: '#FFFFFF',
        fontSize: 15,
    },
    passwordBox: {
        height: 56,
        borderRadius: 13,
        backgroundColor: '#1C293B',
        borderWidth: 1,
        borderColor: '#344258',
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
    },
    passwordInput: {
        flex: 1,
        color: '#FFFFFF',
        fontSize: 15,
    },
    show: {
        color: '#F59E0B',
        fontWeight: '800',
        fontSize: 11,
    },
    errorBox: {
        backgroundColor: '#3B2028',
        borderWidth: 1,
        borderColor: '#7F303D',
        borderRadius: 10,
        padding: 12,
        marginTop: 5,
    },
    errorText: {
        color: '#FF9A9A',
        fontSize: 12,
    },
    button: {
        height: 58,
        backgroundColor: '#F59E0B',
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 23,
    },
    buttonDisabled: {
        opacity: 0.65,
    },
    buttonText: {
        color: '#101827',
        fontWeight: '900',
        fontSize: 15,
        letterSpacing: 1,
    },
    footer: {
        textAlign: 'center',
        color: '#66758C',
        fontSize: 10,
        letterSpacing: 2,
        marginTop: 55,
    },
});
