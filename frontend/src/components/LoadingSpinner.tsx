import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
    message?: string;
    size?: number;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message, size = 24 }) => {
    return (
        <div className="flex flex-col items-center justify-center space-y-2 p-4">
            <Loader2 className="animate-spin text-primary" size={size} />
            {message && <p className="text-sm text-muted-foreground">{message}</p>}
        </div>
    );
};

export default LoadingSpinner; 