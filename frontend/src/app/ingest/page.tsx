'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FileText, Send, Loader2, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';

export default function PDFDemoPage() {
  const [pdfPath, setPdfPath] = useState('doc/test_pdf.pdf');
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAsk = async () => {
    if (!question.trim()) {
      setError('Please enter a question');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('http://localhost:8010/pdf/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pdf_path: pdfPath,
          question: question,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to process question');
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    try {
      await fetch('http://localhost:8010/pdf/reset', { method: 'POST' });
      setResult(null);
      setError(null);
      setQuestion('');
    } catch (err) {
      console.error('Reset failed:', err);
    }
  };

  const sampleQuestions = [
    'What is this document about?',
    'Summarize the main points',
    'What are the key findings for 2026?',
  ];

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8">
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg mb-4">
            <FileText className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            COMPANY BRAIN API
          </h1>
          <p className="text-muted-foreground">
            Ask natural language questions about your PDF documents
          </p>
        </div>

        {/* PDF Path Input */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              PDF Document
            </CardTitle>
            <CardDescription>
              Path to your PDF file (relative to project root)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              value={pdfPath}
              onChange={(e) => setPdfPath(e.target.value)}
              placeholder="backend/doc/test_pdf.pdf"
              disabled={isLoading}
            />
          </CardContent>
        </Card>

        {/* Question Input */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Ask a Question</CardTitle>
            <CardDescription>
              What would you like to know about this document?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleAsk()}
                placeholder="e.g., What is this document about?"
                disabled={isLoading}
                className="flex-1"
              />
              <Button onClick={handleAsk} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Ask
                  </>
                )}
              </Button>
            </div>

            {/* Sample Questions */}
            {/* <div className="flex flex-wrap gap-2">
              <span className="text-sm text-muted-foreground">Try:</span>
              {sampleQuestions.map((q) => (
                <Button
                  key={q}
                  variant="outline"
                  size="sm"
                  onClick={() => setQuestion(q)}
                  disabled={isLoading}
                >
                  {q}
                </Button>
              ))}
            </div> */}
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Result */}
        {result && (
          <Card className="border-green-200 bg-green-50/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-900">
                <CheckCircle className="h-5 w-5" />
                Answer
              </CardTitle>
              {result.pdf_name && (
                <CardDescription className="text-green-700">
                  From: {result.pdf_name} ({result.total_results || 0} results found)
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="prose prose-sm max-w-none">
                <p className="text-green-900 whitespace-pre-wrap">{result.answer}</p>
              </div>

              {result.sources && result.sources.length > 0 && (
                <div className="space-y-2 pt-4 border-t border-green-200">
                  <h4 className="text-sm font-semibold text-green-900">Sources:</h4>
                  {result.sources.map((source: any, idx: number) => (
                    <div
                      key={idx}
                      className="text-xs bg-white/50 p-3 rounded border border-green-200"
                    >
                      {source.text}
                      {source.score && (
                        <span className="text-muted-foreground ml-2">
                          (score: {source.score.toFixed(2)})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Reset Button */}
        {result && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={handleReset} size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Reset & Ask Another Question
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
