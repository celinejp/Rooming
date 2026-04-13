import { auth, googleProvider, signInWithPopup, db, handleFirestoreError, OperationType } from '@/src/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Home, LogIn } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      // Check if profile exists
      const profileRef = doc(db, 'users', user.uid);
      const profileSnap = await getDoc(profileRef);
      
      if (!profileSnap.exists()) {
        await setDoc(profileRef, {
          uid: user.uid,
          displayName: user.displayName || 'Roommate',
          email: user.email,
          photoURL: user.photoURL || '',
          role: 'member',
          chorePreferences: [],
        });
      }
      toast.success('Logged in successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="max-w-md w-full shadow-xl border-none bg-white/80 backdrop-blur-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto bg-primary/10 w-16 h-16 rounded-2xl flex items-center justify-center">
            <Home className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-3xl font-bold tracking-tight">Rooming</CardTitle>
            <CardDescription className="text-base">
              The operating system for people who live together.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={handleLogin} 
            className="w-full h-12 text-lg gap-3 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all"
          >
            <LogIn className="h-5 w-5" />
            Continue with Google
          </Button>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
